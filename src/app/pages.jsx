// Mapa rota → página.
import { TodayPage } from '../features/today/TodayPage.jsx';
import { PatientSheet } from '../features/patient-sheet/PatientSheet.jsx';
import { PatientsPage } from '../features/patients/PatientsPage.jsx';
import { useRoute } from './router.jsx';

function Placeholder({ title }) {
  return <h1>{title}</h1>;
}

/** Ficha aberta sobre a página de origem (a lista continua visível atrás no computador). */
function PatientRoute() {
  const { params } = useRoute();
  const from = window.history.state?.from || '/hoje';
  const Behind = from.startsWith('/pacientes') ? PAGES.pacientes : PAGES.hoje;
  return (
    <>
      <Behind />
      <PatientSheet key={params.id} patientId={Number(params.id)} />
    </>
  );
}

export const PAGES = {
  hoje: TodayPage,
  pacientes: PatientsPage,
  paciente: PatientRoute,
  importar: () => <Placeholder title="Importar agenda" />,
  configuracoes: () => <Placeholder title="Configurações" />,
};
