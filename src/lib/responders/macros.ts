export function macroDocsVideoMismatch(name?: string) {
  return `
${name ? `Hey ${name},` : "Hey,"}

That video shows an example email some customers receive, but not everyone will get that exact message depending on when the unit shipped and which update path applies.

Reply with:
1) which unit you have (Apex / G-Series / Cluster)
2) the order email or order number
3) what you see when you try to update (error or screenshot if possible)

I'll point you to the correct update method for your exact setup.

– Rob
`.trim();
}

export function macroFirmwareAccessClarify() {
  return `
Hey — I can help, but I need 3 quick details so I don't send you the wrong file:

1) Which unit are you updating (Apex / G-Series / Cluster)?
2) What exactly happens when the site "kicks you off" (login loop, error message, blank page, etc.)?
3) What email did you order with (or your order number)?

– Rob
`.trim();
}
