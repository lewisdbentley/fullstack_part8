const { ApolloServer, gql, UserInputError, AuthenticationError } = require('apollo-server')
const { v1: uuid } = require('uuid')
const mongoose = require('mongoose')
const jwt = require('jsonwebtoken')
const { PASSWORD } = require('./utils/config')
const Book = require('./models/Book')
const Author = require('./models/Author')
const User = require('./models/User')
const { update } = require('./models/Book')


const MONGODB_URI = `mongodb+srv://lewisdbentley:${ PASSWORD }@cluster0.qnuen.mongodb.net/library?retryWrites=true&w=majority`

console.log('connecting to', MONGODB_URI)

mongoose.connect(MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true, useFindAndModify: false, useCreateIndex: true })
  .then(() => {
    console.log('connected to MongoDB')
  })
  .catch((error) => {
    console.log('error connection to MongoDB:', error.message)
  })

const typeDefs = gql`
type Book {
  title: String!
  published: Int!
  author: Author!
  genres: [String!]!
  id: ID!
}
type Author {
  name: String!
  id: String!
  born: Int
  bookCount: Int!
}
type Query {
  bookCount: Int!
  authorCount: Int!
  allBooks(author: String, genres: [String]): [Book!]!
  allAuthors: [Author!]!
  allUsers: [User]
  me: User
}
type User {
  username: String!
  favoriteGenre: String!
  id: ID!
}
type Token {
  value: String!
}
type Mutation {
  addBook(
    title: String!
    published: Int!
    author: String!
    genres: [String]
  ) : Book
  editAuthor(
    name: String!
    setBornTo: Int!
  ) : Author
  createUser(
    username: String!
    favoriteGenre: String!
  ): User
  login(
    username: String!
    password: String!
  ): Token
  addFavoriteGenre(
    favoriteGenre: String!
  ) : User
}
`

const JWT_SECRET = 'NEED_HERE_A_SECRET_KEY'

const resolvers = {
  Query: {
    bookCount: () => Book.collection.countDocuments(),
    authorCount: () => Author.collection.countDocuments(),
    allUsers: async () => await User.find({}),
    allBooks: async (root, args) => {
      if (!args.author && !args.genres) {
        console.log('no args')
        return await Book.find({})
      }
      if (args.author && args.genres) {

        let booksFilteredByAuthor = books.filter(book => book.author === args.author)
        return booksFilteredByAuthor.filter(book => book.genres.includes(args.genres))
      }
      if (args.author) {
        return books.filter(book => book.author === args.author)
      }
      if (args.genres) {
        console.log('args.genre', args.genres)
        // return books.filter(book => book.genres.includes(args.genre))
        let foundBooks = await Book.find({ genres: { $in: args.genres } })
        return foundBooks
      }
    },
    allAuthors: async () => await Author.find({}),
    me: (root, args, context) => {
      console.log('me query', context.currentUser, root, args, '----------')
      return context.currentUser
    }
  },
  Author: {
    bookCount: async (root) => {
      const count = await Book.find({ author: root._id })
      return count.length
    }
  },
  Book: {
    author: async (root) => {
      let foundAuthor = await Author.findOne({ _id: root.author })
      return foundAuthor
    }
  },
  Mutation: {
    addBook: async (root, args, { currentUser }) => {
      if (!currentUser) {
        throw new AuthenticationError('not authenticated')
      }
      let findAuthor = await Author.findOne({ name: args.author })
      if(!findAuthor) {
        findAuthor = new Author({ name: args.author, bookCount: 1 })
        try {
          await findAuthor.save()
        } catch(error) {
          throw new UserInputError(error.message, {
            invalidArgs: args,
          })
        }
      }
      // add book to db
      const book = new Book({ ...args, author: findAuthor })
      try {
        await book.save()
      } catch(error) {
        throw new UserInputError(error.message, {
          invalidArgs: args,
        })
      }
      return book
    },
    editAuthor: async (root, args, context) => {
      if (!context.currentUser) {
        throw new AuthenticationError('not authenticated')
      }
      let author
      try {
        await Author.updateOne({ name: args.name }, { born: args.setBornTo })
        author = await Author.findOne({ name: args.name })
      } catch(error) {
        throw new UserInputError(error.message, {
          invalidArgs: args,
        })
      }
      return author
    },
    createUser: (root, args) => {
      const user = new User({ username: args.username, favoriteGenre: args.favoriteGenre })
      return user.save()
        .catch(error => {
          throw new UserInputError(error.message, {
            invalidArgs: args,
          })
        })
    },
    login: async (root, args) => {
      const user = await User.findOne({ username: args.username })
      if ( !user || args.password !== 'secred' ) {
        throw new UserInputError('wrong credentials')
      }
      const userForToken = {
        username: user.username,
        id: user._id,
      }
      return { value: jwt.sign(userForToken, JWT_SECRET) }
    },
    addFavoriteGenre: async (root, args, context) => {
      context.currentUser.favoriteGenre = args.favoriteGenre
      await context.currentUser.save()
      return context.currentUser
    }
  }
}

const server = new ApolloServer({
  typeDefs,
  resolvers,
  context: async ({ req }) => {
    const auth = req ? req.headers.authorization : null
    if (auth && auth.toLowerCase().startsWith('bearer ')){
      const decodedToken = jwt.verify(auth.substring(7), JWT_SECRET)
      const currentUser = await User.findById(decodedToken.id).populate('friends')
      return { currentUser }
    }
  }
})

server.listen().then(({ url }) => {
  console.log(`Server ready at ${url}`)
})