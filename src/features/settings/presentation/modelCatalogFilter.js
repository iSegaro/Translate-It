export const filterModelCatalog = (models, searchQuery) => {
  const query = searchQuery.trim().toLocaleLowerCase()
  const matches = models.filter(({ value, name }) => !query
    || value.toLocaleLowerCase().includes(query)
    || name.toLocaleLowerCase().includes(query))

  return {
    total: matches.length,
    options: matches
      .slice(0, 50)
      .map(({ value, name }) => ({ value, label: `${name} (${value})` })),
  }
}
