// troika-three-text ships no type declarations. Only the API used by this app is typed.
declare module 'troika-three-text' {
	export function configureTextBuilder(config: {
		defaultFontURL?: string | null
		unicodeFontsURL?: string
		sdfGlyphSize?: number
		sdfExponent?: number
		sdfMargin?: number
		textureWidth?: number
		useWorker?: boolean
	}): void
}
