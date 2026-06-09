export function createLiveCaptionNotImplementedError(contractName) {
  const error = new Error(`${contractName} is not implemented yet`);
  error.code = 'LIVE_CAPTION_NOT_IMPLEMENTED';
  return error;
}

export function assertNotImplemented(contractName, methodName = null) {
  const label = methodName ? `${contractName}.${methodName}` : contractName;
  throw createLiveCaptionNotImplementedError(label);
}
