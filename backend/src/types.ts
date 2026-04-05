import express, { Request } from 'express';
import { JwtPayload } from 'jsonwebtoken';

export interface UserPayload extends JwtPayload {
  id: string;
}

declare module 'express-serve-static-core' {
  interface Request {
    user?: UserPayload;
  }
}
