export interface ApiResponse<TData = unknown, TMeta = unknown> {
  success: boolean;
  message: string;
  data: TData;
  meta?: TMeta;
}

export interface ApiErrorResponse<TDetails = unknown, TMeta = unknown> {
  success: false;
  message: string;
  error: {
    code: string;
    details: TDetails;
  };
  meta?: TMeta;
}
