const express = require('express');
const { ApolloServer } = require('apollo-server-express');
const cors = require('cors');
const typeDefs = require('./graphql/schema');
const resolvers = require('./graphql/resolvers');
require('dotenv').config();
const { authenticateUser } = require('./middleware/auth');

async function startServer() {
    const app = express();

    // Middleware
    app.use(cors());
    app.use(express.json());

    // Health check endpoint
    app.get('/health', (req, res) => {
        res.json({ status: 'ok', timestamp: new Date().toISOString() });
    });

    // Apollo Server setup
    const server = new ApolloServer({
        typeDefs,
        resolvers,
        context: async ({ req }) => {
            const authHeader = req.headers.authorization || '';
            let authContext = { req };

            try {
                if (authHeader) {
                    const { user, staff, token } = await authenticateUser(authHeader);
                    authContext = {
                        req,
                        user,
                        staff,
                        token
                    };
                }
            } catch (error) {
                // If token is invalid, we don't necessarily want to crash the whole request context creation
                // But we can attach the error or just no user context.
                // For simplicity, we'll log it and proceed without user.
                // Resolvers will handle missing auth.
                console.warn('Auth context creation failed:', error.message);
            }

            return authContext;
        },
        formatError: (error) => {
            console.error('GraphQL Error:', error);
            return {
                message: error.message,
                code: error.extensions?.code || 'INTERNAL_SERVER_ERROR'
            };
        }
    });

    await server.start();
    server.applyMiddleware({ app, path: '/graphql' });

    const PORT = process.env.PORT || 4000;

    app.listen(PORT, () => {
        console.log(`🚀 Server ready at http://localhost:${PORT}`);
        console.log(`📊 GraphQL endpoint: http://localhost:${PORT}${server.graphqlPath}`);
    });
}

startServer().catch((error) => {
    console.error('Failed to start server:', error);
    process.exit(1);
});
