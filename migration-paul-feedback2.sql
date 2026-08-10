-- Announcements: vysvetlenie rozdielu voči AMMEX operačným e-mailom
update categories set
  description_en = 'Community-wide notices from the Board — separate from routine operational emails sent directly by AMMEX (INMHO). Only the Board can post here.',
  description_es = 'Avisos para toda la comunidad de parte de la Junta — independientes de los correos operativos habituales enviados directamente por AMMEX (INMHO). Solo la Junta puede publicar aquí.',
  description_fr = 'Avis destinés à toute la communauté de la part du Conseil — distincts des e-mails opérationnels habituels envoyés directement par AMMEX (INMHO). Seul le Conseil peut publier ici.',
  description_de = 'Gemeinschaftsweite Mitteilungen des Vorstands — getrennt von den routinemäßigen Betriebs-E-Mails, die direkt von AMMEX (INMHO) versendet werden. Nur der Vorstand kann hier posten.'
where slug = 'oznamy';

-- Ideas & Suggestions: kto vidí a odpovedá
update categories set
  description_en = 'Visible to all approved members. Anyone can reply — replies are visible to everyone, not just the Board.',
  description_es = 'Visible para todos los miembros aprobados. Cualquiera puede responder — las respuestas son visibles para todos, no solo para la Junta.',
  description_fr = "Visible par tous les membres approuvés. Tout le monde peut répondre — les réponses sont visibles par tous, pas seulement par le Conseil.",
  description_de = 'Sichtbar für alle genehmigten Mitglieder. Jeder kann antworten — Antworten sind für alle sichtbar, nicht nur für den Vorstand.'
where slug = 'napady';

-- General Discussion: jasnejšie než "Free communication"
update categories set
  description_en = 'Open conversation among approved members. Anyone can start a topic or reply — all posts and replies are visible to every member, not private.',
  description_es = 'Conversación abierta entre miembros aprobados. Cualquiera puede iniciar un tema o responder — todas las publicaciones y respuestas son visibles para todos los miembros, no son privadas.',
  description_fr = "Conversation ouverte entre membres approuvés. Tout le monde peut lancer un sujet ou répondre — toutes les publications et réponses sont visibles par tous les membres, elles ne sont pas privées.",
  description_de = 'Offenes Gespräch unter genehmigten Mitgliedern. Jeder kann ein Thema eröffnen oder antworten — alle Beiträge und Antworten sind für jedes Mitglied sichtbar, nicht privat.'
where slug = 'diskusia';
