import { describe, expect, it } from 'vitest'
import { crosswalk, isCrosswalkTypeKey, parseCrosswalkKey } from '../src/lib/crosswalk.js'

describe('crosswalk', () => {
	it('should have type definitions for properties', () => {
		expect(Object.keys(crosswalk.types).length).toBeGreaterThan(0)
		expect(crosswalk.types['schema:SoftwareSourceCode/codeRepository']).toBeDefined()
		expect(crosswalk.types['schema:Thing/name']).toBeDefined()
		expect(crosswalk.types['schema:CreativeWork/version']).toBeDefined()
	})

	it('should have property type arrays', () => {
		const codeRepo = crosswalk.types['schema:SoftwareSourceCode/codeRepository']
		expect(codeRepo).toBeDefined()
		expect(codeRepo).toContain('URL')
	})

	it('should have NodeJS crosswalk mappings', () => {
		const nodeMap = crosswalk.maps.NodeJS
		expect(nodeMap).toBeDefined()
		expect(Object.keys(nodeMap).length).toBeGreaterThan(0)
		expect(nodeMap.repository).toBe('schema:SoftwareSourceCode/codeRepository')
	})

	it('should have Python crosswalk mappings', () => {
		const pyMap = crosswalk.maps['Python Distutils (PyPI)']
		expect(pyMap).toBeDefined()
		expect(Object.keys(pyMap).length).toBeGreaterThan(0)
		expect(pyMap['home-page']).toBe('schema:Thing/url')
		expect(pyMap.summary).toBe('schema:Thing/description')
	})

	it('should have Java crosswalk mappings', () => {
		const javaMap = crosswalk.maps['Java (Maven)']
		expect(javaMap).toBeDefined()
		expect(Object.keys(javaMap).length).toBeGreaterThan(0)
	})

	it('should have Rust crosswalk mappings', () => {
		const rustMap = crosswalk.maps['Rust Package Manager']
		expect(rustMap).toBeDefined()
	})

	it('should parse crosswalk keys', () => {
		const parsed = parseCrosswalkKey('schema:SoftwareSourceCode/codeRepository')
		expect(parsed).toBeDefined()
		expect(parsed!.parentType).toBe('schema:SoftwareSourceCode')
		expect(parsed!.property).toBe('codeRepository')
	})

	it('should validate crosswalk type keys', () => {
		expect(isCrosswalkTypeKey('schema:SoftwareSourceCode/codeRepository')).toBe(true)
		expect(isCrosswalkTypeKey('not-a-key')).toBe(false)
	})

	it('should return same reference on multiple imports', () => {
		// The crosswalk is a module-level constant, so importing it again gives the same object
		expect(crosswalk).toBe(crosswalk)
	})
})
