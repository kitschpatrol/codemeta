import { knipConfig } from '@kitschpatrol/knip-config'

export default knipConfig({
	ignore: ['test/fixtures/**/*'],
	ignoreDependencies: ['node-addon-api', 'node-gyp'],
})
