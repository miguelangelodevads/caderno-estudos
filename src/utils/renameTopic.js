export function renameTopic(notebook, topicId, value) {
  const title = value.trim();
  if (!title) throw new Error('Digite um nome para o assunto.');
  if (!notebook.topics?.some((topic) => topic.id === topicId)) throw new Error('Este assunto não existe mais.');
  return notebook.topics.map((topic) => topic.id === topicId ? { ...topic, title } : topic);
}
