// Mapa rota → página.
import { TodayPage } from '../features/today/TodayPage.jsx';
import { PatientSheet } from '../features/patient-sheet/PatientSheet.jsx';
import { PatientsPage } from '../features/patients/PatientsPage.jsx';
import { ImportPage } from '../features/import/ImportPage.jsx';
import { SettingsPage } from '../features/settings/SettingsPage.jsx';
import { useRoute } from './router.jsx';

/** Ficha aberta sobre a página de origem (a lista continua visível atrás no computador). */
function PatientRoute() {
  const { params } = useRoute();
  const from = window.history.state?.from || '/hoje';
  const Behind = from.startsWith('/pacientes') ? PatientsPage : TodayPage;
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
  importar: ImportPage,
  configuracoes: SettingsPage,
};
