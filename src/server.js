const express          = require('express');
const { ApolloServer } = require('apollo-server-express');
const cors             = require('cors');
const typeDefs         = require('./graphql/schema');
const resolvers        = require('./graphql/resolvers');
require('dotenv').config();
const { authenticateUser } = require('./middleware/auth');
const { supabase }         = require('./config/database');

async function startServer() {
    const app = express();

    app.use(cors());
    app.use(express.json());

    // Health check — unchanged
    app.get('/health', (req, res) => {
        res.json({ status: 'ok', timestamp: new Date().toISOString() });
    });

    // ─── Register Staff ────────────────────────────────────────────────────────
    // CHANGES:
    //   1. Caller must be authenticated (Authorization header required)
    //   2. Accepts organization_id and space_id in body
    //   3. Role-based rules: operators can't create anyone, managers can only
    //      create operators within their own org
    app.post('/api/register-staff', async (req, res) => {

        // Step 1: authenticate the caller
        const authHeader = req.headers.authorization || '';
        let caller = null;

        if (authHeader) {
            try {
                const { staff } = await authenticateUser(authHeader);
                caller = staff;
            } catch {
                return res.status(401).json({ error: 'Unauthorized' });
            }
        }

        if (!caller) {
            return res.status(401).json({ error: 'Authentication required' });
        }

        const { email, password, name, phone, role, organization_id, space_id } = req.body;

        // Validate required fields
        if (!email || !password || !name || !role || !organization_id) {
            return res.status(400).json({
                error: 'Missing required fields: email, password, name, role, organization_id'
            });
        }

        // Role-based creation rules
        if (caller.role === 'operator') {
            return res.status(403).json({ error: 'Operators cannot create staff accounts' });
        }

        if (caller.role === 'manager') {
            if (role !== 'operator') {
                return res.status(403).json({ error: 'Managers can only create operator accounts' });
            }
            if (organization_id !== caller.organization_id) {
                return res.status(403).json({ error: 'Cannot create staff for a different organization' });
            }
        }

        // Operators must have a space; managers must not
        if (role === 'operator' && !space_id) {
            return res.status(400).json({ error: 'Operators require a space_id' });
        }
        if (role === 'manager' && space_id) {
            return res.status(400).json({ error: 'Managers should not be assigned to a space' });
        }

        try {
            // Validate org exists and is active
            const { data: org } = await supabase
                .from('organizations')
                .select('id')
                .eq('id', organization_id)
                .eq('is_active', true)
                .single();

            if (!org) {
                return res.status(400).json({ error: 'Organization not found or inactive' });
            }

            // Validate space belongs to org
            if (space_id) {
                const { data: space } = await supabase
                    .from('spaces')
                    .select('id, organization_id')
                    .eq('id', space_id)
                    .single();

                if (!space) {
                    return res.status(400).json({ error: 'Space not found' });
                }
                if (space.organization_id !== organization_id) {
                    return res.status(400).json({ error: 'Space does not belong to this organization' });
                }
            }

            // Create Supabase Auth user
            const { data: authData, error: authError } = await supabase.auth.signUp({
                email,
                password,
            });

            if (authError) throw authError;

            if (!authData.user) {
                return res.status(400).json({ error: 'User creation failed. (Email may already be taken)' });
            }

            const userId = authData.user.id;

            // Insert staff record
            const { data: staffData, error: staffError } = await supabase
                .from('staff')
                .insert([{
                    user_id:         userId,
                    name,
                    email,
                    phone:           phone           || null,
                    role,
                    organization_id,
                    space_id:        space_id        || null,
                    is_active:       true
                }])
                .select()
                .single();

            if (staffError) throw staffError;

            res.status(201).json({
                message: 'Staff user created successfully',
                user:    authData.user,
                staff:   staffData
            });

        } catch (error) {
            console.error('Registration error:', error);
            res.status(500).json({ error: error.message });
        }
    });

    // ─── Apollo Server ────────────────────────────────────────────────────────

    const server = new ApolloServer({
        typeDefs,
        resolvers,
        context: async ({ req }) => {
            const authHeader = req.headers.authorization || '';
            let authContext  = { req };

            try {
                if (authHeader) {
                    // CHANGE: context now includes organization and space
                    const { user, staff, organization, space, token } = await authenticateUser(authHeader);
                    authContext = { req, user, staff, organization, space, token };
                }
            } catch (error) {
                console.warn('Auth context creation failed:', error.message);
            }

            return authContext;
        },
        formatError: (error) => {
            console.error('GraphQL Error:', error);
            return {
                message: error.message,
                code:    error.extensions?.code || 'INTERNAL_SERVER_ERROR'
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
