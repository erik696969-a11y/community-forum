// Preklady pre modul Memoria (board-only „elektronický mozog komunity“).
// Oddelené od lib/i18n.js, aby sa modul dal rozširovať bez zásahov do
// hlavného slovníka. Rovnaké jazyky ako zvyšok aplikácie (en/es/fr/de);
// chýbajúci preklad padne na angličtinu.

import { govDict } from './memoriaI18nGov';
import { opsDict } from './memoriaI18nOps';
import { importDict } from './memoriaI18nImport';
import { budgetDict } from './memoriaI18nBudget';

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

  // Karty, 2. časť
  tabContracts: { en: 'Contracts', es: 'Contratos', fr: 'Contrats', de: 'Verträge' },
  tabTenders: { en: 'Tenders & quotes', es: 'Licitaciones y ofertas', fr: 'Appels d’offres', de: 'Ausschreibungen' },
  tabInvoices: { en: 'Invoices', es: 'Facturas', fr: 'Factures', de: 'Rechnungen' },
  none: { en: '— none —', es: '— ninguno —', fr: '— aucun —', de: '— keine —' },
  supplier: { en: 'Supplier', es: 'Proveedor', fr: 'Fournisseur', de: 'Lieferant' },
  amount: { en: 'Amount', es: 'Importe', fr: 'Montant', de: 'Betrag' },
  currency: { en: 'Currency', es: 'Moneda', fr: 'Devise', de: 'Währung' },
  description: { en: 'Description', es: 'Descripción', fr: 'Description', de: 'Beschreibung' },
  approvedByDecision: { en: 'Approved by decision', es: 'Aprobado por la decisión', fr: 'Approuvé par la décision', de: 'Genehmigt durch Entscheidung' },
  days: { en: 'days', es: 'días', fr: 'jours', de: 'Tage' },

  // Upozornenia (prehľad)
  alertsTitle: { en: 'Needs attention', es: 'Requiere atención', fr: 'À traiter', de: 'Handlungsbedarf' },
  alertsNone: { en: 'Nothing needs attention right now.', es: 'Nada pendiente por ahora.', fr: 'Rien à signaler pour le moment.', de: 'Derzeit nichts zu tun.' },
  alertContractEnding: {
    en: 'Contract "{name}" ends on {date}',
    es: 'El contrato "{name}" vence el {date}',
    fr: 'Le contrat « {name} » se termine le {date}',
    de: 'Vertrag „{name}“ endet am {date}',
  },
  alertContractNotice: {
    en: 'Contract "{name}" renews automatically — last day to give notice: {date}',
    es: 'El contrato "{name}" se renueva automáticamente; último día para preavisar: {date}',
    fr: 'Le contrat « {name} » se renouvelle automatiquement — dernier jour de préavis : {date}',
    de: 'Vertrag „{name}“ verlängert sich automatisch – letzter Kündigungstag: {date}',
  },
  alertUnratified: {
    en: 'Urgent unbudgeted expense not yet ratified by the Board: {name}',
    es: 'Gasto urgente no presupuestado pendiente de ratificar por la Junta: {name}',
    fr: 'Dépense urgente hors budget pas encore ratifiée par le conseil : {name}',
    de: 'Dringende außerplanmäßige Ausgabe noch nicht vom Vorstand ratifiziert: {name}',
  },
  alertOverdue: {
    en: 'Invoice {name} was due on {date} and is not marked as paid',
    es: 'La factura {name} vencía el {date} y no figura como pagada',
    fr: 'La facture {name} était due le {date} et n’est pas marquée payée',
    de: 'Rechnung {name} war am {date} fällig und ist nicht als bezahlt markiert',
  },
  alertSingleQuote: {
    en: 'Tender "{name}" was decided with fewer than 2 quotes',
    es: 'La licitación "{name}" se decidió con menos de 2 ofertas',
    fr: 'L’appel d’offres « {name} » a été attribué avec moins de 2 devis',
    de: 'Ausschreibung „{name}“ wurde mit weniger als 2 Angeboten entschieden',
  },
  alertConflict: {
    en: 'Active supplier without a conflict-of-interest check: {name}',
    es: 'Proveedor activo sin verificación de conflicto de intereses: {name}',
    fr: 'Fournisseur actif sans vérification de conflit d’intérêts : {name}',
    de: 'Aktiver Lieferant ohne Prüfung auf Interessenkonflikt: {name}',
  },
  alertsFactsOnly: {
    en: 'These are facts from the records, not recommendations. Decisions stay with the Board.',
    es: 'Son hechos de los registros, no recomendaciones. Las decisiones corresponden a la Junta.',
    fr: 'Ce sont des faits issus des registres, pas des recommandations. Les décisions restent au conseil.',
    de: 'Dies sind Fakten aus den Einträgen, keine Empfehlungen. Die Entscheidung liegt beim Vorstand.',
  },

  // Zmluvy
  newContract: { en: 'New contract', es: 'Nuevo contrato', fr: 'Nouveau contrat', de: 'Neuer Vertrag' },
  subject: { en: 'Subject', es: 'Objeto', fr: 'Objet', de: 'Gegenstand' },
  signedOn: { en: 'Signed on', es: 'Firmado el', fr: 'Signé le', de: 'Unterzeichnet am' },
  startsOn: { en: 'Starts', es: 'Inicio', fr: 'Début', de: 'Beginn' },
  endsOn: { en: 'Ends', es: 'Fin', fr: 'Fin', de: 'Ende' },
  autoRenew: { en: 'Renews automatically', es: 'Renovación automática', fr: 'Renouvellement automatique', de: 'Verlängert sich automatisch' },
  noticePeriodDays: { en: 'Notice period (days)', es: 'Preaviso (días)', fr: 'Préavis (jours)', de: 'Kündigungsfrist (Tage)' },
  paymentFrequency: { en: 'Payment', es: 'Pago', fr: 'Paiement', de: 'Zahlung' },
  freq_one_off: { en: 'One-off', es: 'Único', fr: 'Unique', de: 'Einmalig' },
  freq_monthly: { en: 'Monthly', es: 'Mensual', fr: 'Mensuel', de: 'Monatlich' },
  freq_quarterly: { en: 'Quarterly', es: 'Trimestral', fr: 'Trimestriel', de: 'Vierteljährlich' },
  freq_yearly: { en: 'Yearly', es: 'Anual', fr: 'Annuel', de: 'Jährlich' },
  freq_other: { en: 'Other', es: 'Otro', fr: 'Autre', de: 'Sonstiges' },
  contractStatus_negotiating: { en: 'Negotiating', es: 'En negociación', fr: 'En négociation', de: 'In Verhandlung' },
  contractStatus_active: { en: 'Active', es: 'Vigente', fr: 'En vigueur', de: 'Aktiv' },
  contractStatus_ended: { en: 'Ended', es: 'Finalizado', fr: 'Terminé', de: 'Beendet' },
  contractStatus_disputed: { en: 'In dispute', es: 'En disputa', fr: 'En litige', de: 'Strittig' },
  noticeDeadline: { en: 'Give notice by', es: 'Preavisar antes del', fr: 'Préavis avant le', de: 'Kündigen bis' },
  signedBy: { en: 'Signed by', es: 'Firmado por', fr: 'Signé par', de: 'Unterzeichnet von' },
  tender: { en: 'Tender', es: 'Licitación', fr: 'Appel d’offres', de: 'Ausschreibung' },
  contractDatesInvalid: {
    en: 'The end date must be after the start date.',
    es: 'La fecha de fin debe ser posterior a la de inicio.',
    fr: 'La date de fin doit être postérieure à la date de début.',
    de: 'Das Enddatum muss nach dem Beginn liegen.',
  },

  // Zákazky a ponuky
  newTender: { en: 'New tender', es: 'Nueva licitación', fr: 'Nouvel appel d’offres', de: 'Neue Ausschreibung' },
  openedOn: { en: 'Opened on', es: 'Abierta el', fr: 'Ouvert le', de: 'Eröffnet am' },
  approvedBudget: { en: 'Approved budget', es: 'Presupuesto aprobado', fr: 'Budget approuvé', de: 'Genehmigtes Budget' },
  tenderStatus_collecting: { en: 'Collecting quotes', es: 'Recogiendo ofertas', fr: 'Collecte des devis', de: 'Angebote werden eingeholt' },
  tenderStatus_decided: { en: 'Decided', es: 'Adjudicada', fr: 'Attribué', de: 'Entschieden' },
  tenderStatus_cancelled: { en: 'Cancelled', es: 'Cancelada', fr: 'Annulé', de: 'Abgebrochen' },
  selectedSupplier: { en: 'Selected supplier', es: 'Proveedor elegido', fr: 'Fournisseur retenu', de: 'Gewählter Lieferant' },
  selectionReason: { en: 'Why this supplier', es: 'Motivo de la elección', fr: 'Motif du choix', de: 'Grund der Auswahl' },
  quotes: { en: 'Quotes', es: 'Ofertas', fr: 'Devis', de: 'Angebote' },
  noQuotes: { en: 'No quotes yet.', es: 'Todavía no hay ofertas.', fr: 'Pas encore de devis.', de: 'Noch keine Angebote.' },
  addQuote: { en: 'Add quote', es: 'Añadir oferta', fr: 'Ajouter un devis', de: 'Angebot hinzufügen' },
  vatIncluded: { en: 'VAT included', es: 'IVA incluido', fr: 'TVA incluse', de: 'inkl. MwSt.' },
  vatExcluded: { en: 'excl. VAT', es: 'sin IVA', fr: 'HT', de: 'zzgl. MwSt.' },
  submittedOn: { en: 'Received on', es: 'Recibida el', fr: 'Reçu le', de: 'Eingegangen am' },
  validUntil: { en: 'Valid until', es: 'Válida hasta', fr: 'Valable jusqu’au', de: 'Gültig bis' },
  lowest: { en: 'lowest', es: 'la más baja', fr: 'le plus bas', de: 'günstigstes' },
  chooseThis: { en: 'Choose this one', es: 'Elegir esta', fr: 'Retenir', de: 'Auswählen' },
  chosen: { en: 'Chosen', es: 'Elegida', fr: 'Retenu', de: 'Ausgewählt' },
  overBudget: { en: 'over budget', es: 'supera el presupuesto', fr: 'au-dessus du budget', de: 'über Budget' },
  mixedVat: {
    en: 'Note: some quotes include VAT and some do not — compare carefully.',
    es: 'Atención: algunas ofertas incluyen IVA y otras no; compárelas con cuidado.',
    fr: 'Attention : certains devis incluent la TVA, d’autres non — comparez avec soin.',
    de: 'Hinweis: Einige Angebote enthalten MwSt., andere nicht – sorgfältig vergleichen.',
  },
  chooseReasonPrompt: {
    en: 'Why is this supplier chosen? (saved as the selection reason)',
    es: '¿Por qué se elige este proveedor? (se guarda como motivo)',
    fr: 'Pourquoi ce fournisseur est-il retenu ? (enregistré comme motif)',
    de: 'Warum wird dieser Lieferant gewählt? (wird als Begründung gespeichert)',
  },

  // Faktúry
  newInvoice: { en: 'New invoice', es: 'Nueva factura', fr: 'Nouvelle facture', de: 'Neue Rechnung' },
  invoiceNumber: { en: 'Invoice no.', es: 'Nº factura', fr: 'N° de facture', de: 'Rechnungsnr.' },
  invoiceDate: { en: 'Invoice date', es: 'Fecha factura', fr: 'Date de facture', de: 'Rechnungsdatum' },
  dueDate: { en: 'Due date', es: 'Vencimiento', fr: 'Échéance', de: 'Fällig am' },
  paidOn: { en: 'Paid on', es: 'Pagada el', fr: 'Payée le', de: 'Bezahlt am' },
  netAmount: { en: 'Net', es: 'Base', fr: 'HT', de: 'Netto' },
  vatAmount: { en: 'VAT', es: 'IVA', fr: 'TVA', de: 'MwSt.' },
  totalAmount: { en: 'Total', es: 'Total', fr: 'Total', de: 'Gesamt' },
  payment_pending: { en: 'Pending', es: 'Pendiente', fr: 'En attente', de: 'Offen' },
  payment_paid: { en: 'Paid', es: 'Pagada', fr: 'Payée', de: 'Bezahlt' },
  payment_overdue: { en: 'Overdue', es: 'Vencida', fr: 'En retard', de: 'Überfällig' },
  payment_disputed: { en: 'Disputed', es: 'En disputa', fr: 'Contestée', de: 'Strittig' },
  paymentStatus: { en: 'Payment status', es: 'Estado de pago', fr: 'Statut du paiement', de: 'Zahlungsstatus' },
  fundingSource: { en: 'Paid from', es: 'Pagado con', fr: 'Payé par', de: 'Bezahlt aus' },
  fund_ordinary_budget: { en: 'Ordinary budget', es: 'Presupuesto ordinario', fr: 'Budget ordinaire', de: 'Ordentliches Budget' },
  fund_reserve_fund: { en: 'Reserve fund', es: 'Fondo de reserva', fr: 'Fonds de réserve', de: 'Rücklage' },
  fund_extraordinary_levy: { en: 'Extraordinary levy', es: 'Derrama', fr: 'Appel de fonds exceptionnel', de: 'Sonderumlage' },
  invcat_maintenance: { en: 'Maintenance', es: 'Mantenimiento', fr: 'Entretien', de: 'Wartung' },
  invcat_repair: { en: 'Repair', es: 'Reparación', fr: 'Réparation', de: 'Reparatur' },
  invcat_insurance: { en: 'Insurance', es: 'Seguros', fr: 'Assurance', de: 'Versicherung' },
  invcat_utilities: { en: 'Utilities', es: 'Suministros', fr: 'Services publics', de: 'Versorgung' },
  invcat_staff_cleaning: { en: 'Staff / cleaning', es: 'Personal / limpieza', fr: 'Personnel / nettoyage', de: 'Personal / Reinigung' },
  invcat_gardening: { en: 'Gardening', es: 'Jardinería', fr: 'Jardinage', de: 'Gartenpflege' },
  invcat_pools: { en: 'Pools', es: 'Piscinas', fr: 'Piscines', de: 'Pools' },
  invcat_security: { en: 'Security', es: 'Seguridad', fr: 'Sécurité', de: 'Sicherheit' },
  invcat_administration: { en: 'Administration', es: 'Administración', fr: 'Administration', de: 'Verwaltung' },
  invcat_legal: { en: 'Legal', es: 'Legal', fr: 'Juridique', de: 'Recht' },
  invcat_improvement: { en: 'Improvement', es: 'Mejora', fr: 'Amélioration', de: 'Verbesserung' },
  invcat_other: { en: 'Other', es: 'Otros', fr: 'Autre', de: 'Sonstiges' },
  periodYear: { en: 'Year', es: 'Año', fr: 'Année', de: 'Jahr' },
  periodMonth: { en: 'Month', es: 'Mes', fr: 'Mois', de: 'Monat' },
  contract: { en: 'Contract', es: 'Contrato', fr: 'Contrat', de: 'Vertrag' },
  urgentUnbudgeted: {
    en: 'Urgent unbudgeted expense (Statutes art. XXX: approved by President + Administrator, to be ratified by the Board)',
    es: 'Gasto urgente no presupuestado (Estatutos art. XXX: autorizado por Presidente + Administrador, a ratificar por la Junta)',
    fr: 'Dépense urgente hors budget (statuts art. XXX : autorisée par Président + Administrateur, à ratifier par le conseil)',
    de: 'Dringende außerplanmäßige Ausgabe (Satzung Art. XXX: von Präsident + Verwalter genehmigt, vom Vorstand zu ratifizieren)',
  },
  urgencyReason: { en: 'Why it was urgent', es: 'Motivo de la urgencia', fr: 'Motif de l’urgence', de: 'Grund der Dringlichkeit' },
  urgencyReasonRequired: {
    en: 'Please explain why the expense was urgent.',
    es: 'Explique por qué el gasto era urgente.',
    fr: 'Veuillez expliquer pourquoi la dépense était urgente.',
    de: 'Bitte begründen, warum die Ausgabe dringend war.',
  },
  ratifiedByDecision: { en: 'Ratified by decision', es: 'Ratificado por la decisión', fr: 'Ratifié par la décision', de: 'Ratifiziert durch Entscheidung' },
  notRatified: { en: 'Not yet ratified', es: 'Pendiente de ratificar', fr: 'Pas encore ratifié', de: 'Noch nicht ratifiziert' },
  urgentBadge: { en: 'Urgent', es: 'Urgente', fr: 'Urgent', de: 'Dringend' },
  onlyUnratified: {
    en: 'Only unratified urgent expenses',
    es: 'Solo gastos urgentes sin ratificar',
    fr: 'Seulement les dépenses urgentes non ratifiées',
    de: 'Nur nicht ratifizierte dringende Ausgaben',
  },
  totalShown: { en: 'Total of the invoices shown', es: 'Total de las facturas mostradas', fr: 'Total des factures affichées', de: 'Summe der angezeigten Rechnungen' },
  duplicateInvoice: {
    en: 'This supplier already has an invoice with this number.',
    es: 'Este proveedor ya tiene una factura con este número.',
    fr: 'Ce fournisseur a déjà une facture avec ce numéro.',
    de: 'Für diesen Lieferanten gibt es bereits eine Rechnung mit dieser Nummer.',
  },

  // Prílohy
  attachments: { en: 'Attachments', es: 'Adjuntos', fr: 'Pièces jointes', de: 'Anhänge' },
  noAttachments: { en: 'No attachments.', es: 'Sin adjuntos.', fr: 'Aucune pièce jointe.', de: 'Keine Anhänge.' },
  addAttachment: { en: 'Add attachment', es: 'Añadir adjunto', fr: 'Ajouter une pièce jointe', de: 'Anhang hinzufügen' },
  attachmentTitle: { en: 'Title', es: 'Título', fr: 'Titre', de: 'Titel' },
  attachmentType: { en: 'Type', es: 'Tipo', fr: 'Type', de: 'Art' },
  file: { en: 'File (max 25 MB)', es: 'Archivo (máx. 25 MB)', fr: 'Fichier (25 Mo max.)', de: 'Datei (max. 25 MB)' },
  orLink: { en: '…or link', es: '…o enlace', fr: '…ou lien', de: '…oder Link' },
  documentDate: { en: 'Document date', es: 'Fecha del documento', fr: 'Date du document', de: 'Dokumentdatum' },
  open: { en: 'Open', es: 'Abrir', fr: 'Ouvrir', de: 'Öffnen' },
  uploading: { en: 'Uploading…', es: 'Subiendo…', fr: 'Envoi…', de: 'Wird hochgeladen…' },
  fileOrLinkRequired: {
    en: 'Choose a file or enter a link.',
    es: 'Elija un archivo o introduzca un enlace.',
    fr: 'Choisissez un fichier ou saisissez un lien.',
    de: 'Datei wählen oder Link eingeben.',
  },
  fileTooLarge: {
    en: 'The file is larger than 25 MB.',
    es: 'El archivo supera los 25 MB.',
    fr: 'Le fichier dépasse 25 Mo.',
    de: 'Die Datei ist größer als 25 MB.',
  },
  doc_invoice: { en: 'Invoice', es: 'Factura', fr: 'Facture', de: 'Rechnung' },
  doc_contract: { en: 'Contract', es: 'Contrato', fr: 'Contrat', de: 'Vertrag' },
  doc_quote: { en: 'Quote', es: 'Oferta', fr: 'Devis', de: 'Angebot' },
  doc_minutes: { en: 'Minutes', es: 'Acta', fr: 'Procès-verbal', de: 'Protokoll' },
  doc_statutes: { en: 'Statutes', es: 'Estatutos', fr: 'Statuts', de: 'Satzung' },
  doc_rules: { en: 'Rules', es: 'Normas', fr: 'Règlement', de: 'Hausordnung' },
  doc_insurance_policy: { en: 'Insurance policy', es: 'Póliza de seguro', fr: 'Police d’assurance', de: 'Versicherungspolice' },
  doc_inspection_report: { en: 'Inspection report', es: 'Informe de inspección', fr: 'Rapport d’inspection', de: 'Prüfbericht' },
  doc_audit_report: { en: 'Audit report', es: 'Informe de auditoría', fr: 'Rapport d’audit', de: 'Prüfungsbericht' },
  doc_correspondence: { en: 'Correspondence', es: 'Correspondencia', fr: 'Correspondance', de: 'Korrespondenz' },
  doc_photo: { en: 'Photo', es: 'Foto', fr: 'Photo', de: 'Foto' },
  doc_other: { en: 'Other', es: 'Otro', fr: 'Autre', de: 'Sonstiges' },

  // Prehľad podľa kategórie
  tabReport: { en: 'Overview', es: 'Resumen', fr: 'Synthèse', de: 'Übersicht' },
  reportIntro: {
    en: 'Choose a category and a period to see which companies worked for us, their contracts, whether quotes were compared and why each was chosen.',
    es: 'Elija una categoría y un periodo para ver qué empresas trabajaron para nosotros, sus contratos, si se compararon ofertas y por qué se eligió cada una.',
    fr: 'Choisissez une catégorie et une période pour voir quelles entreprises ont travaillé pour nous, leurs contrats, si des devis ont été comparés et pourquoi chacune a été choisie.',
    de: 'Wählen Sie Kategorie und Zeitraum: welche Firmen für uns tätig waren, ihre Verträge, ob Angebote verglichen wurden und warum sie gewählt wurden.',
  },
  periodFrom: { en: 'From', es: 'Desde', fr: 'Du', de: 'Von' },
  periodTo: { en: 'To', es: 'Hasta', fr: 'Au', de: 'Bis' },
  showReport: { en: 'Show', es: 'Mostrar', fr: 'Afficher', de: 'Anzeigen' },
  print: { en: 'Print / PDF', es: 'Imprimir / PDF', fr: 'Imprimer / PDF', de: 'Drucken / PDF' },
  exportCsv: { en: 'Export CSV', es: 'Exportar CSV', fr: 'Exporter CSV', de: 'CSV exportieren' },
  statCompanies: { en: 'Companies', es: 'Empresas', fr: 'Entreprises', de: 'Firmen' },
  statContracts: { en: 'Contracts', es: 'Contratos', fr: 'Contrats', de: 'Verträge' },
  statWithQuotes: { en: 'Contracts with ≥ 2 quotes', es: 'Contratos con ≥ 2 ofertas', fr: 'Contrats avec ≥ 2 devis', de: 'Verträge mit ≥ 2 Angeboten' },
  statInvoiced: { en: 'Invoiced in period', es: 'Facturado en el periodo', fr: 'Facturé sur la période', de: 'Im Zeitraum fakturiert' },
  duration: { en: 'Duration', es: 'Duración', fr: 'Durée', de: 'Dauer' },
  months: { en: 'months', es: 'meses', fr: 'mois', de: 'Monate' },
  ongoing: { en: 'ongoing', es: 'vigente', fr: 'en cours', de: 'laufend' },
  quotesCompared: { en: 'Quotes', es: 'Ofertas', fr: 'Devis', de: 'Angebote' },
  noTenderLinked: { en: 'no tender linked', es: 'sin licitación vinculada', fr: 'aucun appel d’offres lié', de: 'keine Ausschreibung verknüpft' },
  whyChosen: { en: 'Why chosen', es: 'Motivo de la elección', fr: 'Pourquoi retenu', de: 'Warum gewählt' },
  notRecorded: { en: 'not recorded', es: 'no registrado', fr: 'non renseigné', de: 'nicht erfasst' },
  invoicedInPeriod: { en: 'Invoiced (period)', es: 'Facturado (periodo)', fr: 'Facturé (période)', de: 'Fakturiert (Zeitraum)' },
  invoicesWithoutContract: {
    en: 'Invoices in this period from suppliers without a contract in the period',
    es: 'Facturas del periodo de proveedores sin contrato en el periodo',
    fr: 'Factures de la période de fournisseurs sans contrat sur la période',
    de: 'Rechnungen im Zeitraum von Lieferanten ohne Vertrag im Zeitraum',
  },
  gapsTitle: { en: 'Missing information', es: 'Información que falta', fr: 'Informations manquantes', de: 'Fehlende Angaben' },
  gapNoTender: {
    en: 'Contract "{name}" has no linked tender — we cannot show whether quotes were compared.',
    es: 'El contrato "{name}" no tiene licitación vinculada; no se puede mostrar si se compararon ofertas.',
    fr: 'Le contrat « {name} » n’a pas d’appel d’offres lié — impossible de montrer si des devis ont été comparés.',
    de: 'Vertrag „{name}“ hat keine verknüpfte Ausschreibung – ob Angebote verglichen wurden, ist nicht ersichtlich.',
  },
  gapNoReason: {
    en: 'Tender "{name}" has no recorded reason for the choice.',
    es: 'La licitación "{name}" no tiene registrado el motivo de la elección.',
    fr: 'L’appel d’offres « {name} » n’a pas de motif de choix renseigné.',
    de: 'Ausschreibung „{name}“ hat keinen erfassten Auswahlgrund.',
  },
  gapNoDates: {
    en: 'Contract "{name}" has no start or end date.',
    es: 'El contrato "{name}" no tiene fecha de inicio o fin.',
    fr: 'Le contrat « {name} » n’a pas de date de début ou de fin.',
    de: 'Vertrag „{name}“ hat kein Anfangs- oder Enddatum.',
  },
  gapNoAmount: {
    en: 'Contract "{name}" has no amount.',
    es: 'El contrato "{name}" no tiene importe.',
    fr: 'Le contrat « {name} » n’a pas de montant.',
    de: 'Vertrag „{name}“ hat keinen Betrag.',
  },
  noGaps: { en: 'No missing information.', es: 'No falta información.', fr: 'Aucune information manquante.', de: 'Keine fehlenden Angaben.' },
  reportEmpty: {
    en: 'No contracts or invoices in this category and period.',
    es: 'No hay contratos ni facturas en esta categoría y periodo.',
    fr: 'Aucun contrat ni facture pour cette catégorie et cette période.',
    de: 'Keine Verträge oder Rechnungen in dieser Kategorie und diesem Zeitraum.',
  },
  generatedOn: { en: 'Generated on {date} from Memoria records.', es: 'Generado el {date} a partir de los registros de Memoria.', fr: 'Généré le {date} à partir des données de Memoria.', de: 'Erstellt am {date} aus den Memoria-Einträgen.' },
  alertContractNoTender: {
    en: 'Active contract without a linked tender (quote comparison not documented): {name}',
    es: 'Contrato vigente sin licitación vinculada (comparación de ofertas no documentada): {name}',
    fr: 'Contrat en vigueur sans appel d’offres lié (comparaison de devis non documentée) : {name}',
    de: 'Aktiver Vertrag ohne verknüpfte Ausschreibung (Angebotsvergleich nicht dokumentiert): {name}',
  },
  alertTenderNoReason: {
    en: 'Decided tender without a recorded reason for the choice: {name}',
    es: 'Licitación adjudicada sin motivo de elección registrado: {name}',
    fr: 'Appel d’offres attribué sans motif de choix renseigné : {name}',
    de: 'Entschiedene Ausschreibung ohne erfassten Auswahlgrund: {name}',
  },
};

export const DECISION_BODIES = ['general_meeting', 'board', 'president', 'president_administrator', 'administrator'];
export const DECISION_STATUSES = ['active', 'suspended', 'superseded', 'cancelled'];
export const SUPPLIER_CATEGORIES = [
  'gardening', 'pools', 'electrical', 'plumbing', 'construction', 'cleaning', 'security', 'lifts',
  'it_telecom', 'insurance', 'legal', 'administration', 'utilities', 'pest_control', 'other',
];
export const SUPPLIER_STATUSES = ['active', 'inactive', 'blacklisted'];
export const CONTRACT_STATUSES = ['negotiating', 'active', 'ended', 'disputed'];
export const PAYMENT_FREQUENCIES = ['one_off', 'monthly', 'quarterly', 'yearly', 'other'];
export const TENDER_STATUSES = ['collecting', 'decided', 'cancelled'];
export const PAYMENT_STATUSES = ['pending', 'paid', 'overdue', 'disputed'];
export const FUNDING_SOURCES = ['ordinary_budget', 'reserve_fund', 'extraordinary_levy'];
export const INVOICE_CATEGORIES = [
  'maintenance', 'repair', 'insurance', 'utilities', 'staff_cleaning', 'gardening',
  'pools', 'security', 'administration', 'legal', 'improvement', 'other',
];
export const DOC_TYPES = [
  'invoice', 'contract', 'quote', 'minutes', 'statutes', 'rules', 'insurance_policy',
  'inspection_report', 'audit_report', 'correspondence', 'photo', 'other',
];
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
export const TASK_STATUSES = ['not_started', 'in_progress', 'blocked', 'done', 'cancelled'];
export const OPEN_TASK_STATUSES = ['not_started', 'in_progress', 'blocked'];
export const EXECUTOR_ROLES = ['administrator', 'president', 'vice_president', 'board_member', 'site_manager', 'supplier', 'other'];
export const OBLIGATION_CATEGORIES = [
  'inspection', 'pool_hygiene', 'insurance', 'contract', 'general_meeting', 'board_meeting',
  'budget', 'legal_deadline', 'gdpr', 'fees', 'other',
];
export const RECURRENCES = ['once', 'monthly', 'quarterly', 'semiannual', 'annual', 'biennial', 'five_yearly'];
export const RECURRENCE_MONTHS = { monthly: 1, quarterly: 3, semiannual: 6, annual: 12, biennial: 24, five_yearly: 60 };
export const MEETING_BODIES = ['board', 'general_ordinary', 'general_extraordinary'];
export const MEETING_STATUSES = ['planned', 'held', 'cancelled'];
export const AGENDA_ITEM_TYPES = ['decision', 'information', 'review'];
// Minimálny predstih pozvánky podľa stanov (čl. XXII.5 board, čl. XX zhromaždenie).
export const INVITATION_LEAD_DAYS = { board: 8, general_ordinary: 15, general_extraordinary: 15 };

// Suma vo formáte jazyka aplikácie, napr. „1.234,50 €“.
export function formatMoney(amount, currency, lang) {
  if (amount === null || amount === undefined || amount === '') return '—';
  const locale = { en: 'en-GB', es: 'es-ES', fr: 'fr-FR', de: 'de-DE' }[lang] || 'en-GB';
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency: currency || 'EUR' }).format(Number(amount));
  } catch {
    return `${Number(amount).toFixed(2)} ${currency || 'EUR'}`;
  }
}

// Suma zaokrúhlená na celé eurá (prehľady, dlaždice).
export function formatMoneyRound(amount, currency, lang) {
  const locale = { en: 'en-GB', es: 'es-ES', fr: 'fr-FR', de: 'de-DE' }[lang] || 'en-GB';
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency: currency || 'EUR', maximumFractionDigits: 0 }).format(Number(amount || 0));
  } catch {
    return `${Math.round(Number(amount || 0))} ${currency || 'EUR'}`;
  }
}

// Dnešný dátum ako 'YYYY-MM-DD' v miestnom čase (bez posunu cez UTC).
export function todayIso() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// Posun dátumu 'YYYY-MM-DD' o daný počet dní (výsledok opäť 'YYYY-MM-DD').
export function addDaysIso(iso, days) {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

// Počet dní od dnes do dátumu 'YYYY-MM-DD' (záporné = v minulosti).
export function daysUntil(iso) {
  if (!iso) return null;
  const [y, m, d] = iso.split('-').map(Number);
  const [ty, tm, td] = todayIso().split('-').map(Number);
  return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(ty, tm - 1, td)) / 86400000);
}

// Rozdiel dvoch dátumov 'YYYY-MM-DD' v dňoch (b - a).
export function daysBetween(a, b) {
  const [ay, am, ad] = a.split('-').map(Number);
  const [by, bm, bd] = b.split('-').map(Number);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86400000);
}

// Posun dátumu o N mesiacov (31. 1. + 1 mesiac = 28./29. 2.).
export function addMonthsIso(iso, months) {
  const [y, m, d] = iso.split('-').map(Number);
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, lastDay));
  return target.toISOString().slice(0, 10);
}

// Text „o N dní“ / „N dní po termíne“ / „dnes“.
export function relativeDue(iso, lang) {
  const n = daysUntil(iso);
  if (n === null) return '';
  if (n === 0) return mt(lang, 'dueToday');
  if (n < 0) return mt(lang, 'overdueDays', { n: -n });
  return mt(lang, 'dueInDays', { n });
}

export function mt(lang, key, vars) {
  const entry = dict[key] || govDict[key] || opsDict[key] || importDict[key] || budgetDict[key];
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
