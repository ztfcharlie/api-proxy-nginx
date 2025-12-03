const swaggerDefinition = {
    openapi: '3.0.0',
    info: {
        title: 'OAuth2 Mock Service API',
        version: '1.0.0',
        description: 'Google OAuth2 Mock Service for AI Proxy System',
        contact: {
            name: 'API Support',
            email: 'support@example.com'
        },
        license: {
            name: 'MIT',
            url: 'https://opensource.org/licenses/MIT'
        }
    },
    servers: [
        {
            url: process.env.API_BASE_URL || 'http://localhost:8889',
            description: 'Development server'
        },
        {
            url: 'https://oauth2-mock.example.com',
            description: 'Production server'
        }
    ],
    components: {
        securitySchemes: {
            bearerAuth: {
                type: 'http',
                scheme: 'bearer',
                bearerFormat: 'JWT',
                description: 'JWT Authentication Token'
            }
        },
        schemas: {
            Client: {
                type: 'object',
                required: ['client_id', 'client_name'],
                properties: {
                    client_id: {
                        type: 'string',
                        description: 'Unique client identifier',
                        example: 'abc123def456'
                    },
                    client_name: {
                        type: 'string',
                        description: 'Human readable client name',
                        example: 'My Application'
                    },
                    description: {
                        type: 'string',
                        description: 'Client description',
                        example: 'A sample OAuth2 client application'
                    },
                    redirect_uris: {
                        type: 'array',
                        items: {
                            type: 'string'
                        },
                        description: 'Allowed redirect URIs',
                        example: ['http://localhost:3000/callback']
                    },
                    is_active: {
                        type: 'boolean',
                        description: 'Whether the client is active',
                        example: true
                    },
                    created_at: {
                        type: 'string',
                        format: 'date-time',
                        description: 'Creation timestamp'
                    },
                    updated_at: {
                        type: 'string',
                        format: 'date-time',
                        description: 'Last update timestamp'
                    }
                }
            },
            ServiceAccount: {
                type: 'object',
                required: ['id', 'client_email', 'project_id', 'display_name'],
                properties: {
                    id: {
                        type: 'integer',
                        description: 'Service account ID',
                        example: 1
                    },
                    client_email: {
                        type: 'string',
                        description: 'Service account email',
                        example: 'my-service@my-project.iam.gserviceaccount.com'
                    },
                    project_id: {
                        type: 'string',
                        description: 'Google Cloud project ID',
                        example: 'my-project'
                    },
                    display_name: {
                        type: 'string',
                        description: 'Display name',
                        example: 'My Service Account'
                    },
                    is_active: {
                        type: 'boolean',
                        description: 'Whether the service account is active',
                        example: true
                    },
                    last_used: {
                        type: 'string',
                        format: 'date-time',
                        description: 'Last usage timestamp'
                    },
                    created_at: {
                        type: 'string',
                        format: 'date-time',
                        description: 'Creation timestamp'
                    },
                    updated_at: {
                        type: 'string',
                        format: 'date-time',
                        description: 'Last update timestamp'
                    }
                }
            },
            TokenMapping: {
                type: 'object',
                required: ['id', 'client_token', 'google_access_token', 'expires_at', 'status'],
                properties: {
                    id: {
                        type: 'integer',
                        description: 'Token mapping ID',
                        example: 1
                    },
                    client_token: {
                        type: 'string',
                        description: 'Client access token',
                        example: 'client_access_token_abc123'
                    },
                    google_access_token: {
                        type: 'string',
                        description: 'Google access token (mock)',
                        example: 'ya29.google_access_token_xyz789'
                    },
                    expires_at: {
                        type: 'string',
                        format: 'date-time',
                        description: 'Token expiration time'
                    },
                    status: {
                        type: 'string',
                        enum: ['active', 'revoked', 'expired'],
                        description: 'Token status',
                        example: 'active'
                    },
                    cache_version: {
                        type: 'integer',
                        description: 'Cache version',
                        example: 1
                    },
                    created_at: {
                        type: 'string',
                        format: 'date-time',
                        description: 'Creation timestamp'
                    },
                    updated_at: {
                        type: 'string',
                        format: 'date-time',
                        description: 'Last update timestamp'
                    }
                }
            },
            ErrorResponse: {
                type: 'object',
                required: ['success', 'error'],
                properties: {
                    success: {
                        type: 'boolean',
                        example: false
                    },
                    error: {
                        type: 'object',
                        required: ['code', 'message'],
                        properties: {
                            code: {
                                type: 'string',
                                description: 'Error code',
                                example: 'VALIDATION_ERROR'
                            },
                            message: {
                                type: 'string',
                                description: 'Error message',
                                example: 'Invalid input data'
                            },
                            details: {
                                type: 'object',
                                description: 'Additional error details'
                            },
                            timestamp: {
                                type: 'string',
                                format: 'date-time',
                                description: 'Error timestamp'
                            }
                        }
                    }
                }
            },
            PaginatedResponse: {
                type: 'object',
                required: ['success', 'data'],
                properties: {
                    success: {
                        type: 'boolean',
                        example: true
                    },
                    data: {
                        type: 'object',
                        required: ['items', 'pagination'],
                        properties: {
                            items: {
                                type: 'array',
                                description: 'List of items'
                            },
                            pagination: {
                                type: 'object',
                                required: ['page', 'limit', 'total', 'pages'],
                                properties: {
                                    page: {
                                        type: 'integer',
                                        description: 'Current page number',
                                        example: 1
                                    },
                                    limit: {
                                        type: 'integer',
                                        description: 'Items per page',
                                        example: 20
                                    },
                                    total: {
                                        type: 'integer',
                                        description: 'Total number of items',
                                        example: 100
                                    },
                                    pages: {
                                        type: 'integer',
                                        description: 'Total number of pages',
                                        example: 5
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    },
    security: [
        {
            bearerAuth: []
        }
    ],
    tags: [
        {
            name: 'OAuth2',
            description: 'OAuth2 authentication endpoints'
        },
        {
            name: 'Clients',
            description: 'OAuth2 client management'
        },
        {
            name: 'Service Accounts',
            description: 'Service account management'
        },
        {
            name: 'Admin',
            description: 'Administrative endpoints'
        },
        {
            name: 'Health',
            description: 'Health check endpoints'
        }
    ]
};

const options = {
    definition: swaggerDefinition,
    apis: [
        './routes/*.js',  // Path to the API docs
        './services/*.js' // Path to service documentation
    ]
};

module.exports = swaggerDefinition;