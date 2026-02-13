export const logger = (req, res, next) => {
  const start = Date.now();
  
  // After the response is finished
  res.on('finish', () => {
    const duration = Date.now() - start;
    const { method, originalUrl } = req;
    const { statusCode } = res;
    
    let color = '\x1b[0m'; // Default
    if (statusCode >= 500) color = '\x1b[31m'; // Red for Server Errors
    else if (statusCode >= 400) color = '\x1b[33m'; // Yellow for Client Errors
    else if (statusCode >= 200) color = '\x1b[32m'; // Green for Success
    
    console.log(`${new Date().toISOString()} - ${color}${method} ${originalUrl} ${statusCode}\x1b[0m - ${duration}ms`);
  });

  next();
};

export const errorHandler = (err, req, res, next) => {
  const statusCode = err.status || 500;
  const message = err.message || 'Something went wrong!';
  
  // Log error details for the developer
  console.error(`\x1b[31m[Error] ${statusCode} - ${message}\x1b[0m`);
  
  if (process.env.NODE_ENV !== 'production') {
    console.error(err.stack);
  }

  res.status(statusCode).json({
    status: 'error',
    message: message,
    error: process.env.NODE_ENV !== 'production' ? err : {}
  });
};
