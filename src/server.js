const express = require('express');
const { ApolloServer } = require('apollo-server-express');
const cors = require('cors');
const typeDefs = require('./graphql/schema');
const resolvers = require('./graphql/resolvers');
require('dotenv').config();
const { authenticateUser } = require('./middleware/auth');
const { supabase } = require('./config/database');

async function startServer() {
    const app = express();

    // Middleware
    app.use(cors());
    app.use(express.json());

    // Health check endpoint
    app.get('/health', (req, res) => {
        res.json({ status: 'ok', timestamp: new Date().toISOString() });
    });

    // Endpoint to register staff (creates Auth user + Staff record)
    app.post('/api/register-staff', async (req, res) => {
        const { email, password, name, phone, role } = req.body;

        if (!email || !password || !name || !role) {
            return res.status(400).json({ error: 'Missing required fields: email, password, name, role' });
        }

        try {
            // 1. Create user in Supabase Auth
            const { data: authData, error: authError } = await supabase.auth.signUp({
                email,
                password,
            });

            if (authError) throw authError;

            if (!authData.user) {
                return res.status(400).json({ error: 'User creation failed. (Check if email is already taken)' });
            }

            const userId = authData.user.id;

            // 2. Insert into staff table
            const { data: staffData, error: staffError } = await supabase
                .from('staff')
                .insert([
                    {
                        user_id: userId,
                        name,
                        email: email,
                        phone: phone || null,
                        role,
                        is_active: true
                    }
                ])
                .select()
                .single();

            if (staffError) throw staffError;

            res.status(201).json({
                message: 'Staff user created successfully',
                user: authData.user,
                staff: staffData
            });

        } catch (error) {
            console.error('Registration error:', error);
            res.status(500).json({ error: error.message });
        }
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
