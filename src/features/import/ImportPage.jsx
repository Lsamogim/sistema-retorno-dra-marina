import { useRef, useState } from 'react';
import { FileSpreadsheet, Upload } from 'lucide-react';
import { Button, Card } from '../../ui/index.js';
import { endpoints } from '../../api/endpoints.js';
import { useToday } from '../../state/useToday.jsx';
import { useRoute } from '../../app/router.jsx';
import styles from './Import.module.css';

const ACCEPT = '.xlsx,.xls,.csv';

function summaryLines(s) {
  const lines = [`Importados ${s.validEvents} atendimentos`];
  if (s.newPatients) lines.push(`${s.newPatients} pacientes novos`);
  if (s.removedAppointments) lines.push(`${s.removedAppointments} removidos (cancelados)`);
  return lines.join(' · ');
}

export function ImportPage() {
  const today = useToday();
  const { navigate } = useRoute();
  const inputRef = useRef(null);
  const [file, setFile] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [state, setState] = useState({ status: 'idle' });

  const pick = (f) => {
    if (!f) return;
    setFile(f);
    setState({ status: 'idle' });
  };

  const submit = async () => {
    if (!file) return;
    setState({ status: 'loading' });
    try {
      const res = await endpoints.importFile(file);
      setState({ status: 'done', summary: res.summary });
      setFile(null);
      if (inputRef.current) inputRef.current.value = '';
      today.reload();
    } catch (err) {
      setState({ status: 'error', error: err.message });
    }
  };

  return (
    <div className={styles.page}>
      <header>
        <h1 className={styles.title}>Importar agenda</h1>
        <p className={styles.lead}>
          Envie a planilha exportada do aplicativo de agendamentos (uma vez por semana). Os agendamentos marcados à mão
          são confirmados pela planilha.
        </p>
      </header>

      <label
        className={`${styles.drop} ${dragging ? styles.dragging : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          pick(e.dataTransfer.files?.[0]);
        }}
      >
        <FileSpreadsheet size={32} aria-hidden="true" className={styles.dropIcon} />
        <span className={styles.dropTitle}>{file ? file.name : 'Arraste a planilha aqui ou toque para escolher'}</span>
        <span className={styles.dropHint}>Formatos aceitos: .xlsx, .xls ou .csv (até 8 MB)</span>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          aria-label="Planilha da agenda"
          className="visually-hidden"
          onChange={(e) => pick(e.target.files?.[0])}
        />
      </label>

      <div>
        <Button variant="primary" icon={<Upload size={18} />} disabled={!file} loading={state.status === 'loading'} onClick={submit}>
          Importar agenda
        </Button>
      </div>

      {state.status === 'error' && (
        <p className={styles.error} role="alert">
          {state.error}
        </p>
      )}

      {state.status === 'done' && (
        <Card className={styles.result} role="status">
          <p className={styles.resultTitle}>{summaryLines(state.summary)}</p>
          {state.summary.cleanupSkipped > 0 && (
            <p className={styles.warning}>
              {state.summary.cleanupSkipped} agendamentos mantidos (parecia exportação parcial). Se a planilha era só de uma
              profissional ou de um período menor, está tudo certo.
            </p>
          )}
          <Button variant="secondary" onClick={() => navigate('/hoje')}>
            Ver a lista de hoje
          </Button>
        </Card>
      )}
    </div>
  );
}
