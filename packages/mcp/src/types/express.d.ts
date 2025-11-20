/**
 * Express type extensions
 */

declare namespace Express {
  interface Request {
    skyfiApiKey?: string;
  }
}
