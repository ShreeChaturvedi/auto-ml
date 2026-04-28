export type DeploymentCreateErrorCode =
  | 'MODEL_NOT_FOUND'
  | 'MODEL_PROJECT_MISMATCH'
  | 'INELIGIBLE_TASK_TYPE'
  | 'MISSING_ARTIFACT'
  | 'INVALID_ARTIFACT'
  | 'DEPLOYMENT_LIMIT_REACHED'
  | 'RUNTIME_FAILURE';

export class DeploymentCreateError extends Error {
  readonly code: DeploymentCreateErrorCode;

  constructor(code: DeploymentCreateErrorCode, message: string) {
    super(message);
    this.name = 'DeploymentCreateError';
    this.code = code;
  }
}

export function isDeploymentCreateError(error: unknown): error is DeploymentCreateError {
  return error instanceof DeploymentCreateError;
}

export function getDeploymentCreateErrorStatus(error: DeploymentCreateError): number {
  switch (error.code) {
    case 'MODEL_NOT_FOUND':
    case 'MODEL_PROJECT_MISMATCH':
      return 404;
    case 'INELIGIBLE_TASK_TYPE':
    case 'MISSING_ARTIFACT':
    case 'INVALID_ARTIFACT':
      return 400;
    case 'DEPLOYMENT_LIMIT_REACHED':
      return 409;
    case 'RUNTIME_FAILURE':
      return 500;
  }
}
