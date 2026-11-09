export class ServerInputError extends Error {
  status: number;
  code: string;
  details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'ServerInputError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}
