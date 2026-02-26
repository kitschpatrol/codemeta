import { knipConfig } from '@kitschpatrol/knip-config'

export default knipConfig({
	ignore: ['test/fixtures/**/*'],
	ignoreDependencies: ['tree-sitter-python', 'tree-sitter-ruby'],
})
