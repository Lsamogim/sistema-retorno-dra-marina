// Mapa rota → página. As páginas definitivas entram nas tarefas 9–12.
function Placeholder({ title }) {
  return <h1>{title}</h1>;
}

export const PAGES = {
  hoje: () => <Placeholder title="Hoje" />,
  pacientes: () => <Placeholder title="Pacientes" />,
  paciente: () => <Placeholder title="Paciente" />,
  importar: () => <Placeholder title="Importar agenda" />,
  configuracoes: () => <Placeholder title="Configurações" />,
};
