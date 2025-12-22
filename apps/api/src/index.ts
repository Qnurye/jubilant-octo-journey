import { Hono } from 'hono';
import { User } from '@repo/types';

const app = new Hono();

app.get('/', (c) => {
  const user: User = {
    id: '1',
    name: 'API User',
    email: 'api@example.com',
    role: 'admin',
    createdAt: new Date(),
  };
  return c.json({
    message: 'Hello Hono!',
    user,
  });
});

const port = 8080;

export default {
  port,
  fetch: app.fetch,
};
