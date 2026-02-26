/**
 * Status maps, interface clues, property classification sets.
 */

/** Maps Python development status classifiers to repostatus.org vocabulary values */
export const REPOSTATUS_MAP: Record<string, string> = {
	'1 - planning': 'concept',
	'2 - pre-alpha': 'concept',
	'3 - alpha': 'wip',
	'4 - beta': 'wip', // if --released is set this maps to "active" instead
	'5 - production/stable': 'active',
	'6 - mature': 'active',
	'7 - inactive': 'unsupported',
}

/** All valid repostatus values */
export const REPOSTATUS_VALUES = new Set([
	'abandoned',
	'active',
	'concept',
	'inactive',
	'moved',
	'suspended',
	'unsupported',
	'wip',
])

/** Common source repository prefixes */
export const COMMON_SOURCEREPOS = [
	'https://github.com/',
	'http://github.com/',
	'https://gitlab.com/',
	'http://gitlab.com/',
	'https://codeberg.org/',
	'http://codeberg.org/',
	'https://git.sr.ht/',
	'https://bitbucket.org/',
	'https://bitbucket.com/',
]

/** Keywords indicative of interface types */
export const INTERFACE_CLUES: Array<[string, string]> = [
	['web application', 'WebApplication'],
	['webapp', 'WebApplication'],
	['web-based', 'WebApplication'],
	['website', 'WebSite'],
	['webpage', 'WebPage'],
	['web service', 'WebAPI'],
	['webservice', 'WebAPI'],
	['restful', 'WebAPI'],
	['rest service', 'WebAPI'],
	['web api', 'WebAPI'],
	['library', 'SoftwareLibrary'],
	['module', 'SoftwareLibrary'],
	['command-line', 'CommandLineApplication'],
	['command line', 'CommandLineApplication'],
	['commandline', 'CommandLineApplication'],
	['desktop application', 'DesktopApplication'],
	['windows application', 'DesktopApplication'],
	['windows software', 'DesktopApplication'],
	['mac application', 'DesktopApplication'],
	['graphical user-interface', 'DesktopApplication'],
	['graphical user interface', 'DesktopApplication'],
	['gnome', 'DesktopApplication'],
	['gtk+', 'DesktopApplication'],
	[' qt ', 'DesktopApplication'],
	[' gui', 'DesktopApplication'],
	['desktop gui', 'DesktopApplication'],
	['android app', 'MobileApplication'],
	['ios app', 'MobileApplication'],
	['mobile app', 'MobileApplication'],
	['in a terminal', 'CommandLineApplication'],
	['in the terminal', 'CommandLineApplication'],
	['from the terminal', 'CommandLineApplication'],
	['from a terminal', 'CommandLineApplication'],
	[' api ', 'SoftwareLibrary'],
]

/** Dependencies that suggest a certain interface type */
export const INTERFACE_CLUES_DEPS: Record<string, string> = {
	angular: 'WebApplication',
	bottle: 'WebAPI',
	cherrypy: 'WebAPI',
	clam: 'WebApplication',
	click: 'CommandLineApplication',
	django: 'WebApplication',
	drupal: 'WebApplication',
	falcon: 'WebAPI',
	fastapi: 'WebAPI',
	flask: 'WebApplication',
	gatsby: 'WebApplication',
	hug: 'WebAPI',
	joomla: 'WebApplication',
	jquery: 'WebApplication',
	laravel: 'WebApplication',
	ncurses: 'TerminalApplication',
	react: 'WebApplication',
	spring: 'WebApplication',
	textual: 'TerminalApplication',
	tornado: 'WebAPI',
	vue: 'WebApplication',
	web2py: 'WebApplication',
	wordpress: 'WebApplication',
}
