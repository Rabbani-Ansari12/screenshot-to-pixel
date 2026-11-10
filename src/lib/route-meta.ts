/** Standard <head> for a content route. */
export const pageHead = (title: string, description?: string) => () => ({
  meta: [
    { title: `${title} · Meridian Supply` },
    ...(description ? [{ name: "description", content: description }] : []),
  ],
});
