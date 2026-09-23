// Preklady pre modul Memoria (board-only „elektronický mozog komunity“).
// Oddelené od lib/i18n.js, aby sa modul dal rozširovať bez zásahov do
// hlavného slovníka. Rovnaké jazyky ako zvyšok aplikácie (en/es/fr/de);
// chýbajúci preklad padne na angličtinu.

const dict = {
  memoriaTitle: { en: 'Memoria', es: 'Memoria', fr: 'Memoria', de: 'Memoria' },
  memoriaSubtitle: {
    en: "The board's memory: decisions, suppliers and everything that changes. Visible to board members only.",
    es: 'La memoria de la Junta: decisiones, proveedores y todo lo que cambia. Solo visible para la Junta Directiva.',
    fr: 'La mémoire du conseil : décisions, fournisseurs et tout ce qui change. Visible uniquement par le conseil.',
    de: 'Das Gedächtnis des Vorstands: Entscheidungen, Lieferanten und alle Änderungen. Nur für den Vorstand sichtbar.',
  },
  tabDecisions: { en: 'Decisions', es: 'Decisiones', fr: 'Décisions', de: 'Entscheidungen' },
  tabSuppliers: { en: 'Suppliers', es: 'Proveedores', fr: 'Fournisseurs', de: 'Lieferanten' },
  tabActivity: { en: 'Activity', es: 'Actividad', fr: 'Activité', de: 'Aktivität' },

  // Spoločné
  add: { en: 'Add', es: 'Añadir', fr: 'Ajouter', de: 'Hinzufügen' },
  edit: { en: 'Edit', es: 'Editar', fr: 'Modifier', de: 'Bearbeiten' },
  delete: { en: 'Delete', es: 'Eliminar', fr: 'Supprimer', de: 'Löschen' },
  save: { en: 'Save', es: 'Guardar', fr: 'Enregistrer', de: 'Speichern' },
  saving: { en: 'Saving…', es: 'Guardando…', fr: 'Enregistrement…', de: 'Speichern…' },
  cancel: { en: 'Cancel', es: 'Cancelar', fr: 'Annuler', de: 'Abbrechen' },
  search: { en: 'Search…', es: 'Buscar…', fr: 'Rechercher…', de: 'Suchen…' },
  all: { en: 'All', es: 'Todos', fr: 'Tous', de: 'Alle' },
  showMore: { en: 'Show details', es: 'Ver detalles', fr: 'Voir les détails', de: 'Details anzeigen' },
  showLess: { en: 'Hide details', es: 'Ocultar detalles', fr: 'Masquer les détails', de: 'Details ausblenden' },
  loading: { en: 'Loading…', es: 'Cargando…', fr: 'Chargement…', de: 'Wird geladen…' },
  required: { en: 'required', es: 'obligatorio', fr: 'obligatoire', de: 'Pflichtfeld' },
  confirmDelete: {
    en: 'Delete "{name}"? This cannot be undone (the deletion is kept in the activity log).',
    es: '¿Eliminar "{name}"? No se puede deshacer (la eliminación queda en el registro de actividad).',
    fr: 'Supprimer « {name} » ? Action irréversible (la suppression reste dans le journal d’activité).',
    de: '„{name}“ löschen? Dies kann nicht rückgängig gemacht werden (die Löschung bleibt im Aktivitätsprotokoll).',
  },
  saveError: {
    en: 'Could not save: {error}',
    es: 'No se pudo guardar: {error}',
    fr: 'Enregistrement impossible : {error}',
    de: 'Speichern fehlgeschlagen: {error}',
  },
  deleteBlocked: {
    en: 'This record is still used elsewhere (e.g. a supplier with quotes, contracts or invoices) and cannot be deleted. Set it to inactive instead.',
    es: 'Este registro se usa en otro lugar (p. ej. un proveedor con ofertas, contratos o facturas) y no se puede eliminar. Márquelo como inactivo.',
    fr: 'Cet enregistrement est encore utilisé ailleurs (p. ex. un fournisseur avec devis, contrats ou factures) et ne peut pas être supprimé. Mettez-le plutôt en inactif.',
    de: 'Dieser Eintrag wird noch anderweitig verwendet (z. B. Lieferant mit Angeboten, Verträgen oder Rechnungen) und kann nicht gelöscht werden. Setzen Sie ihn stattdessen auf inaktiv.',
  },
  empty: {
    en: 'Nothing here yet.',
    es: 'Todavía no hay nada.',
    fr: 'Rien pour le moment.',
    de: 'Noch keine Einträge.',
  },
  noMatches: { en: 'No matches.', es: 'Sin resultados.', fr: 'Aucun résultat.', de: 'Keine Treffer.' },

  // Rozhodnutia
  newDecision: { en: 'New decision', es: 'Nueva decisión', fr: 'Nouvelle décision', de: 'Neue Entscheidung' },
  decisionTitle: { en: 'Title', es: 'Título', fr: 'Titre', de: 'Titel' },
  decidedOn: { en: 'Date of decision', es: 'Fecha de la decisión', fr: 'Date de la décision', de: 'Datum der Entscheidung' },
  body: { en: 'Decided by', es: 'Decidido por', fr: 'Décidé par', de: 'Entschieden von' },
  body_general_meeting: { en: 'General Meeting', es: 'Junta General', fr: 'Assemblée générale', de: 'Eigentümerversammlung' },
  body_board: { en: 'Board', es: 'Junta Directiva', fr: 'Conseil', de: 'Vorstand' },
  body_president: { en: 'President', es: 'Presidente', fr: 'Président', de: 'Präsident' },
  body_president_administrator: {
    en: 'President + Administrator (urgent)',
    es: 'Presidente + Administrador (urgente)',
    fr: 'Président + Administrateur (urgent)',
    de: 'Präsident + Verwalter (dringend)',
  },
  body_administrator: { en: 'Administrator', es: 'Administrador', fr: 'Administrateur', de: 'Verwalter' },
  authorityBasis: {
    en: 'Authority (article of the Statutes / resolution)',
    es: 'Base (artículo de los Estatutos / acuerdo)',
    fr: 'Fondement (article des statuts / résolution)',
    de: 'Grundlage (Satzungsartikel / Beschluss)',
  },
  authorityBasisHint: {
    en: 'e.g. Statutes art. XXII.4 or AGM 23/04/2026, item 5',
    es: 'p. ej. Estatutos art. XXII.4 o Junta General 23/04/2026, punto 5',
    fr: 'p. ex. Statuts art. XXII.4 ou AG du 23/04/2026, point 5',
    de: 'z. B. Satzung Art. XXII.4 oder Versammlung 23.04.2026, Punkt 5',
  },
  context: { en: 'Context / problem', es: 'Contexto / problema', fr: 'Contexte / problème', de: 'Kontext / Problem' },
  alternatives: { en: 'Options considered', es: 'Alternativas consideradas', fr: 'Options envisagées', de: 'Geprüfte Alternativen' },
  decisionText: { en: 'Decision', es: 'Decisión', fr: 'Décision', de: 'Entscheidung' },
  rationale: { en: 'Why', es: 'Motivo', fr: 'Pourquoi', de: 'Begründung' },
  votes: { en: 'Votes', es: 'Votos', fr: 'Votes', de: 'Stimmen' },
  votesFor: { en: 'For', es: 'A favor', fr: 'Pour', de: 'Dafür' },
  votesAgainst: { en: 'Against', es: 'En contra', fr: 'Contre', de: 'Dagegen' },
  votesAbstain: { en: 'Abstained', es: 'Abstenciones', fr: 'Abstentions', de: 'Enthaltungen' },
  status: { en: 'Status', es: 'Estado', fr: 'Statut', de: 'Status' },
  decisionStatus_active: { en: 'Active', es: 'Vigente', fr: 'En vigueur', de: 'Gültig' },
  decisionStatus_suspended: { en: 'Suspended', es: 'Suspendida', fr: 'Suspendue', de: 'Ausgesetzt' },
  decisionStatus_superseded: { en: 'Superseded', es: 'Sustituida', fr: 'Remplacée', de: 'Ersetzt' },
  decisionStatus_cancelled: { en: 'Cancelled', es: 'Anulada', fr: 'Annulée', de: 'Aufgehoben' },
  statusNote: {
    en: 'Status note (e.g. why it was suspended)',
    es: 'Nota de estado (p. ej. por qué se suspendió)',
    fr: 'Note de statut (p. ex. raison de la suspension)',
    de: 'Statusnotiz (z. B. Grund der Aussetzung)',
  },
  outcomeReview: {
    en: 'Looking back: how did it work out?',
    es: 'En retrospectiva: ¿qué resultado dio?',
    fr: 'Avec le recul : quel résultat ?',
    de: 'Rückblick: Wie hat es sich bewährt?',
  },
  outcomeReviewedOn: { en: 'Reviewed on', es: 'Revisado el', fr: 'Revu le', de: 'Überprüft am' },
  linkedSuppliers: { en: 'Related suppliers', es: 'Proveedores relacionados', fr: 'Fournisseurs liés', de: 'Betroffene Lieferanten' },
  noSuppliersYet: {
    en: 'No suppliers yet — add them in the Suppliers tab.',
    es: 'Aún no hay proveedores; añádalos en la pestaña Proveedores.',
    fr: 'Pas encore de fournisseurs — ajoutez-les dans l’onglet Fournisseurs.',
    de: 'Noch keine Lieferanten – im Tab Lieferanten hinzufügen.',
  },

  // Dodávatelia
  newSupplier: { en: 'New supplier', es: 'Nuevo proveedor', fr: 'Nouveau fournisseur', de: 'Neuer Lieferant' },
  supplierName: { en: 'Company name', es: 'Nombre de la empresa', fr: 'Nom de l’entreprise', de: 'Firmenname' },
  taxId: { en: 'Tax ID (NIF/CIF)', es: 'NIF/CIF', fr: 'N° fiscal (NIF/CIF)', de: 'Steuernummer (NIF/CIF)' },
  contactPerson: { en: 'Contact person', es: 'Persona de contacto', fr: 'Personne de contact', de: 'Ansprechpartner' },
  phone: { en: 'Phone', es: 'Teléfono', fr: 'Téléphone', de: 'Telefon' },
  email: { en: 'Email', es: 'Email', fr: 'E-mail', de: 'E-Mail' },
  website: { en: 'Website', es: 'Web', fr: 'Site web', de: 'Webseite' },
  category: { en: 'Category', es: 'Categoría', fr: 'Catégorie', de: 'Kategorie' },
  cat_gardening: { en: 'Gardening', es: 'Jardinería', fr: 'Jardinage', de: 'Gartenpflege' },
  cat_pools: { en: 'Pools', es: 'Piscinas', fr: 'Piscines', de: 'Pools' },
  cat_electrical: { en: 'Electrical', es: 'Electricidad', fr: 'Électricité', de: 'Elektro' },
  cat_plumbing: { en: 'Plumbing', es: 'Fontanería', fr: 'Plomberie', de: 'Sanitär' },
  cat_construction: { en: 'Construction', es: 'Obras', fr: 'Travaux', de: 'Bau' },
  cat_cleaning: { en: 'Cleaning', es: 'Limpieza', fr: 'Nettoyage', de: 'Reinigung' },
  cat_security: { en: 'Security', es: 'Seguridad', fr: 'Sécurité', de: 'Sicherheit' },
  cat_lifts: { en: 'Lifts', es: 'Ascensores', fr: 'Ascenseurs', de: 'Aufzüge' },
  cat_it_telecom: { en: 'IT / telecom', es: 'Informática / telecom.', fr: 'Informatique / télécom', de: 'IT / Telekom' },
  cat_insurance: { en: 'Insurance', es: 'Seguros', fr: 'Assurances', de: 'Versicherung' },
  cat_legal: { en: 'Legal', es: 'Legal', fr: 'Juridique', de: 'Recht' },
  cat_administration: { en: 'Administration', es: 'Administración', fr: 'Administration', de: 'Verwaltung' },
  cat_utilities: { en: 'Utilities', es: 'Suministros', fr: 'Services publics', de: 'Versorgung' },
  cat_pest_control: { en: 'Pest control', es: 'Control de plagas', fr: 'Lutte antiparasitaire', de: 'Schädlingsbekämpfung' },
  cat_other: { en: 'Other', es: 'Otros', fr: 'Autre', de: 'Sonstiges' },
  supplierStatus_active: { en: 'Active', es: 'Activo', fr: 'Actif', de: 'Aktiv' },
  supplierStatus_inactive: { en: 'No longer used', es: 'Ya no se usa', fr: 'Plus utilisé', de: 'Nicht mehr genutzt' },
  supplierStatus_blacklisted: { en: 'Do not use', es: 'No contratar', fr: 'À ne pas utiliser', de: 'Nicht beauftragen' },
  statusReason: { en: 'Reason', es: 'Motivo', fr: 'Motif', de: 'Grund' },
  blacklistReasonRequired: {
    en: 'Please give a reason for "Do not use".',
    es: 'Indique el motivo de "No contratar".',
    fr: 'Veuillez indiquer le motif de « À ne pas utiliser ».',
    de: 'Bitte einen Grund für „Nicht beauftragen“ angeben.',
  },
  firstEngagedOn: { en: 'Working with us since', es: 'Trabaja con nosotros desde', fr: 'Travaille avec nous depuis', de: 'Für uns tätig seit' },
  conflictChecked: {
    en: 'Conflict of interest checked (not an owner, the administrator or a related company — AGM 2026, item 6g)',
    es: 'Conflicto de intereses verificado (no es propietario, administrador ni empresa vinculada — Junta 2026, punto 6g)',
    fr: 'Conflit d’intérêts vérifié (ni propriétaire, ni administrateur, ni société liée — AG 2026, point 6g)',
    de: 'Interessenkonflikt geprüft (kein Eigentümer, Verwalter oder verbundenes Unternehmen – Versammlung 2026, Punkt 6g)',
  },
  conflictNotChecked: { en: 'Conflict of interest not checked', es: 'Conflicto de intereses sin verificar', fr: 'Conflit d’intérêts non vérifié', de: 'Interessenkonflikt nicht geprüft' },
  conflictNote: { en: 'Conflict check note', es: 'Nota de la verificación', fr: 'Note de vérification', de: 'Notiz zur Prüfung' },
  notes: { en: 'Notes', es: 'Notas', fr: 'Notes', de: 'Notizen' },
  duplicateTaxId: {
    en: 'A supplier with this tax ID already exists.',
    es: 'Ya existe un proveedor con este NIF/CIF.',
    fr: 'Un fournisseur avec ce numéro fiscal existe déjà.',
    de: 'Ein Lieferant mit dieser Steuernummer existiert bereits.',
  },
  ratings: { en: 'Ratings', es: 'Valoraciones', fr: 'Évaluations', de: 'Bewertungen' },
  noRatings: { en: 'No ratings yet.', es: 'Sin valoraciones.', fr: 'Pas encore d’évaluation.', de: 'Noch keine Bewertungen.' },
  addRating: { en: 'Add rating', es: 'Añadir valoración', fr: 'Ajouter une évaluation', de: 'Bewertung hinzufügen' },
  rating: { en: 'Rating', es: 'Valoración', fr: 'Note', de: 'Bewertung' },
  comment: { en: 'Comment', es: 'Comentario', fr: 'Commentaire', de: 'Kommentar' },
  ratedOn: { en: 'Date', es: 'Fecha', fr: 'Date', de: 'Datum' },
  relatedDecisions: { en: 'Related decisions', es: 'Decisiones relacionadas', fr: 'Décisions liées', de: 'Zugehörige Entscheidungen' },
  noRelatedDecisions: { en: 'No related decisions.', es: 'Sin decisiones relacionadas.', fr: 'Aucune décision liée.', de: 'Keine zugehörigen Entscheidungen.' },

  // Aktivita
  activityIntro: {
    en: 'Every change in Memoria is recorded here automatically and cannot be edited or deleted.',
    es: 'Cada cambio en Memoria se registra aquí automáticamente y no se puede editar ni eliminar.',
    fr: 'Chaque modification dans Memoria est enregistrée ici automatiquement et ne peut être ni modifiée ni supprimée.',
    de: 'Jede Änderung in Memoria wird hier automatisch erfasst und kann nicht bearbeitet oder gelöscht werden.',
  },
  action_insert: { en: 'added', es: 'añadió', fr: 'a ajouté', de: 'hat hinzugefügt' },
  action_update: { en: 'updated', es: 'modificó', fr: 'a modifié', de: 'hat geändert' },
  action_delete: { en: 'deleted', es: 'eliminó', fr: 'a supprimé', de: 'hat gelöscht' },
  entity_memoria_decisions: { en: 'decision', es: 'decisión', fr: 'décision', de: 'Entscheidung' },
  entity_memoria_decision_links: { en: 'decision link', es: 'vínculo de decisión', fr: 'lien de décision', de: 'Entscheidungsverknüpfung' },
  entity_memoria_suppliers: { en: 'supplier', es: 'proveedor', fr: 'fournisseur', de: 'Lieferant' },
  entity_memoria_supplier_ratings: { en: 'supplier rating', es: 'valoración de proveedor', fr: 'évaluation fournisseur', de: 'Lieferantenbewertung' },
  entity_memoria_tenders: { en: 'tender', es: 'licitación', fr: 'appel d’offres', de: 'Ausschreibung' },
  entity_memoria_quotes: { en: 'quote', es: 'oferta', fr: 'devis', de: 'Angebot' },
  entity_memoria_contracts: { en: 'contract', es: 'contrato', fr: 'contrat', de: 'Vertrag' },
  entity_memoria_invoices: { en: 'invoice', es: 'factura', fr: 'facture', de: 'Rechnung' },
  entity_memoria_documents: { en: 'document', es: 'documento', fr: 'document', de: 'Dokument' },
  changedFields: { en: 'Changed', es: 'Cambios', fr: 'Modifié', de: 'Geändert' },
  someone: { en: 'Someone', es: 'Alguien', fr: 'Quelqu’un', de: 'Jemand' },
  loadMore: { en: 'Load older', es: 'Cargar anteriores', fr: 'Charger plus ancien', de: 'Ältere laden' },
};

export const DECISION_BODIES = ['general_meeting', 'board', 'president', 'president_administrator', 'administrator'];
export const DECISION_STATUSES = ['active', 'suspended', 'superseded', 'cancelled'];
export const SUPPLIER_CATEGORIES = [
  'gardening', 'pools', 'electrical', 'plumbing', 'construction', 'cleaning', 'security', 'lifts',
  'it_telecom', 'insurance', 'legal', 'administration', 'utilities', 'pest_control', 'other',
];
export const SUPPLIER_STATUSES = ['active', 'inactive', 'blacklisted'];

export function mt(lang, key, vars) {
  const entry = dict[key];
  let text = entry ? entry[lang] || entry.en : key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) text = text.replace(`{${k}}`, v);
  }
  return text;
}

// Prázdne hodnoty z formulára uloží ako NULL (nie prázdny reťazec).
export function cleanFormValues(values, numberFields = []) {
  const out = {};
  for (const [k, v] of Object.entries(values)) {
    if (typeof v === 'string') {
      const trimmed = v.trim();
      if (trimmed === '') out[k] = null;
      else if (numberFields.includes(k)) out[k] = Number(trimmed);
      else out[k] = trimmed;
    } else {
      out[k] = v;
    }
  }
  return out;
}
