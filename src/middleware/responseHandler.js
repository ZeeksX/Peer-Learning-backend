export const sendSuccess = (res, data, status = 200, metadata = null) => {
  const response = {
    status: 'success',
    data,
  };
  if (metadata) {
    response.metadata = metadata;
  }

  // Log success to console
  console.log(`\x1b[32m[Success] ${status} - Request processed successfully\x1b[0m`);

  return res.status(status).json(response);
};

export const sendError = (res, message, code, status = 400) => {
  // Log error to console
  console.error(`\x1b[31m[Error] ${status} - ${code}: ${message}\x1b[0m`);

  return res.status(status).json({
    status: 'error',
    code,
    message,
    timestamp: new Date().toISOString()
  });
};
