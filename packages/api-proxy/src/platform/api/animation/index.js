import { getEnvObj, envError } from '../../../common/js'

const ENV_OBJ = getEnvObj()

function createAnimation (options = {}) {
  if (!ENV_OBJ.createAnimation) {
    return envError('createAnimation')()
  }
  return ENV_OBJ.createAnimation(options)
}

export {
  createAnimation
}
