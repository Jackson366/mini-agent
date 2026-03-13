import type { Express } from 'express';
import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';

export function setupSwagger(app: Express, port: number): void {
  const swaggerOptions = {
    definition: {
      openapi: '3.0.0',
      info: {
        title: 'Mini Agent API',
        version: '1.0.0',
        description: 'AI Agent 服务器 API 文档',
      },
      servers: [
        {
          url: `http://localhost:${port}`,
          description: '开发服务器',
        },
      ],
    },
    apis: ['./src/routes/*.ts', './dist/routes/*.js'],
  };

  const swaggerSpec = swaggerJsdoc(swaggerOptions);
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
}
