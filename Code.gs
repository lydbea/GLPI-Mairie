/**
 * ============================================================================
 * MuniTrack - Script Google Apps Script (Code.gs)
 * ============================================================================
 * Ce script permet de lier Google Sheets et Google Forms à votre application
 * MuniTrack (base de données Firestore).
 *
 * Fonctionnalités incluses :
 * 1. Synchronisation automatique lors de la soumission d'un Google Formulaire
 * 2. Menu personnalisé dans Google Sheets pour exporter/importer les données
 * 3. Export des tickets d'incidents depuis Firestore vers Google Sheets
 * 4. Export des actifs et équipements vers Google Sheets
 * 5. Création manuelle ou programmée de tickets depuis Google Sheets
 * ============================================================================
 */

// Configuration Firebase issue de votre projet MuniTrack
const CONFIG = {
  PROJECT_ID: "gen-lang-client-0172832596",
  DATABASE_ID: "ai-studio-e2ebdaff-2a62-4c32-8dfb-f318bb2710a6",
  API_KEY: "AIzaSyC4TFvyYcwaqLf1W_8SmCD6YzSIQY93fiw",
  // URL de l'API REST Firestore
  get BASE_URL() {
    return `https://firestore.googleapis.com/v1/projects/${this.PROJECT_ID}/databases/${this.DATABASE_ID}/documents`;
  }
};

/**
 * Menu personnalisé ajouté automatiquement à l'ouverture de la feuille Google Sheets
 */
function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('🏛️ MuniTrack')
    .addItem('📥 Importer les tickets depuis MuniTrack', 'syncTicketsFromFirestore')
    .addItem('📦 Importer les actifs depuis MuniTrack', 'syncAssetsFromFirestore')
    .addItem('👥 Importer l\'équipe des agents', 'syncUsersFromFirestore')
    .addSeparator()
    .addItem('📤 Envoyer la ligne sélectionnée comme Ticket', 'sendSelectedRowAsTicket')
    .addToUi();
}

/**
 * Déclencheur automatique lors de la soumission d'un formulaire Google Forms lié
 * (Pour l'activer : Extensions > Apps Script > Déclencheurs > Ajouter un déclencheur > Lors de la soumission du formulaire)
 */
function onFormSubmit(e) {
  if (!e || !e.values) {
    Logger.log("Aucune donnée d'événement de formulaire reçue.");
    return;
  }

  // Adapter selon l'ordre des questions de votre Google Form :
  // e.values[0] = Horodatage
  // e.values[1] = Titre / Objet de l'incident
  // e.values[2] = Description détaillée
  // e.values[3] = Catégorie (Voirie, Éclairage public, Bâtiments communaux, Espaces verts, Informatique)
  // e.values[4] = Priorité (Urgent, Normal, Bas)
  // e.values[5] = Email de l'agent signalant
  const timestamp = e.values[0] || new Date().toISOString();
  const title = e.values[1] || "Signalement via Formulaire";
  const description = e.values[2] || "";
  const category = e.values[3] || "Voirie";
  const priority = e.values[4] || "Normal";
  const authorEmail = e.values[5] || "agent@mairie.fr";

  createTicketInFirestore({
    title: title,
    description: description,
    category: category,
    priority: priority,
    status: "Nouveau",
    authorId: authorEmail,
    createdAt: new Date().toISOString()
  });
}

/**
 * Crée un ticket dans la collection 'tickets' de Firestore via l'API REST
 */
function createTicketInFirestore(ticketData) {
  const ticketId = "TICK-" + new Date().getTime().toString(36).toUpperCase();
  const url = `${CONFIG.BASE_URL}/tickets/${ticketId}?key=${CONFIG.API_KEY}`;

  const payload = {
    fields: {
      id: { stringValue: ticketId },
      title: { stringValue: ticketData.title || "Incident sans titre" },
      description: { stringValue: ticketData.description || "" },
      category: { stringValue: ticketData.category || "Voirie" },
      priority: { stringValue: ticketData.priority || "Normal" },
      status: { stringValue: ticketData.status || "Nouveau" },
      authorId: { stringValue: ticketData.authorId || "system" },
      createdAt: { timestampValue: ticketData.createdAt || new Date().toISOString() }
    }
  };

  if (ticketData.assetId) {
    payload.fields.assetId = { stringValue: ticketData.assetId };
  }
  if (ticketData.technicianId) {
    payload.fields.technicianId = { stringValue: ticketData.technicianId };
  }

  const options = {
    method: "patch",
    contentType: "application/json",
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  const response = UrlFetchApp.fetch(url, options);
  const responseCode = response.getResponseCode();
  if (responseCode >= 200 && responseCode < 300) {
    Logger.log(`Ticket ${ticketId} créé avec succès.`);
    return ticketId;
  } else {
    Logger.log(`Erreur lors de la création du ticket : ${response.getContentText()}`);
    throw new Error(`Erreur API (${responseCode}): ${response.getContentText()}`);
  }
}

/**
 * Importe tous les tickets depuis Firestore dans l'onglet "Tickets" de Google Sheets
 */
function syncTicketsFromFirestore() {
  const url = `${CONFIG.BASE_URL}/tickets?key=${CONFIG.API_KEY}&pageSize=100`;
  const response = UrlFetchApp.fetch(url, { muteHttpExceptions: true });

  if (response.getResponseCode() !== 200) {
    SpreadsheetApp.getUi().alert("Erreur lors de la récupération des tickets : " + response.getContentText());
    return;
  }

  const data = JSON.parse(response.getContentText());
  const documents = data.documents || [];

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName("Tickets");
  if (!sheet) {
    sheet = ss.insertSheet("Tickets");
  } else {
    sheet.clearContents();
  }

  // En-têtes
  const headers = [
    "ID Ticket", 
    "Titre", 
    "Description", 
    "Catégorie", 
    "Priorité", 
    "Statut", 
    "Auteur", 
    "Assigné à", 
    "Actif concerné", 
    "Date de création"
  ];
  sheet.appendRow(headers);
  sheet.getRange(1, 1, 1, headers.length)
       .setBackground("#1E3A8A")
       .setFontColor("#FFFFFF")
       .setFontWeight("bold");

  const rows = [];
  documents.forEach(doc => {
    const f = doc.fields || {};
    rows.push([
      f.id ? f.id.stringValue : "",
      f.title ? f.title.stringValue : "",
      f.description ? f.description.stringValue : "",
      f.category ? f.category.stringValue : "",
      f.priority ? f.priority.stringValue : "",
      f.status ? f.status.stringValue : "",
      f.authorId ? f.authorId.stringValue : "",
      f.technicianId ? f.technicianId.stringValue : "Non assigné",
      f.assetId ? f.assetId.stringValue : "",
      f.createdAt ? (f.createdAt.timestampValue || f.createdAt.stringValue) : ""
    ]);
  });

  if (rows.length > 0) {
    sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);
    sheet.autoResizeColumns(1, headers.length);
  }

  SpreadsheetApp.getUi().alert(`✅ ${rows.length} tickets ont été importés avec succès depuis MuniTrack !`);
}

/**
 * Importe tous les actifs depuis Firestore dans l'onglet "Actifs"
 */
function syncAssetsFromFirestore() {
  const url = `${CONFIG.BASE_URL}/assets?key=${CONFIG.API_KEY}&pageSize=100`;
  const response = UrlFetchApp.fetch(url, { muteHttpExceptions: true });

  if (response.getResponseCode() !== 200) {
    SpreadsheetApp.getUi().alert("Erreur lors de la récupération des actifs : " + response.getContentText());
    return;
  }

  const data = JSON.parse(response.getContentText());
  const documents = data.documents || [];

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName("Actifs");
  if (!sheet) {
    sheet = ss.insertSheet("Actifs");
  } else {
    sheet.clearContents();
  }

  const headers = ["ID Actif", "Nom de l'équipement", "Type d'actif", "Description"];
  sheet.appendRow(headers);
  sheet.getRange(1, 1, 1, headers.length)
       .setBackground("#0F766E")
       .setFontColor("#FFFFFF")
       .setFontWeight("bold");

  const rows = [];
  documents.forEach(doc => {
    const f = doc.fields || {};
    rows.push([
      f.id ? f.id.stringValue : "",
      f.name ? f.name.stringValue : "",
      f.type ? f.type.stringValue : "",
      f.description ? f.description.stringValue : ""
    ]);
  });

  if (rows.length > 0) {
    sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);
    sheet.autoResizeColumns(1, headers.length);
  }

  SpreadsheetApp.getUi().alert(`✅ ${rows.length} actifs ont été importés avec succès !`);
}

/**
 * Importe les membres de l'équipe depuis Firestore dans l'onglet "Équipe"
 */
function syncUsersFromFirestore() {
  const url = `${CONFIG.BASE_URL}/users?key=${CONFIG.API_KEY}&pageSize=100`;
  const response = UrlFetchApp.fetch(url, { muteHttpExceptions: true });

  if (response.getResponseCode() !== 200) {
    SpreadsheetApp.getUi().alert("Erreur lors de la récupération des utilisateurs : " + response.getContentText());
    return;
  }

  const data = JSON.parse(response.getContentText());
  const documents = data.documents || [];

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName("Équipe");
  if (!sheet) {
    sheet = ss.insertSheet("Équipe");
  } else {
    sheet.clearContents();
  }

  const headers = ["ID Utilisateur", "Nom complet", "Email", "Rôle"];
  sheet.appendRow(headers);
  sheet.getRange(1, 1, 1, headers.length)
       .setBackground("#374151")
       .setFontColor("#FFFFFF")
       .setFontWeight("bold");

  const rows = [];
  documents.forEach(doc => {
    const f = doc.fields || {};
    rows.push([
      f.uid ? f.uid.stringValue : "",
      f.name ? f.name.stringValue : "",
      f.email ? f.email.stringValue : "",
      f.role ? f.role.stringValue : ""
    ]);
  });

  if (rows.length > 0) {
    sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);
    sheet.autoResizeColumns(1, headers.length);
  }

  SpreadsheetApp.getUi().alert(`✅ ${rows.length} membres de l'équipe ont été importés !`);
}

/**
 * Envoie la ligne active sélectionnée dans Google Sheets comme nouveau ticket vers MuniTrack
 */
function sendSelectedRowAsTicket() {
  const sheet = SpreadsheetApp.getActiveSheet();
  const row = sheet.getActiveRange().getRow();

  if (row <= 1) {
    SpreadsheetApp.getUi().alert("Veuillez sélectionner une ligne contenant des données de ticket (hors en-tête).");
    return;
  }

  const values = sheet.getRange(row, 1, 1, 6).getValues()[0];
  const title = values[0] || values[1];
  const description = values[2] || "";
  const category = values[3] || "Voirie";
  const priority = values[4] || "Normal";

  if (!title) {
    SpreadsheetApp.getUi().alert("La ligne sélectionnée doit contenir au moins un titre ou objet d'incident.");
    return;
  }

  try {
    const ticketId = createTicketInFirestore({
      title: String(title),
      description: String(description),
      category: String(category),
      priority: String(priority),
      status: "Nouveau",
      authorId: Session.getActiveUser().getEmail() || "agent-sheets@mairie.fr",
      createdAt: new Date().toISOString()
    });
    SpreadsheetApp.getUi().alert(`✅ Ticket ${ticketId} envoyé avec succès dans MuniTrack !`);
  } catch (err) {
    SpreadsheetApp.getUi().alert("Erreur lors de l'envoi : " + err.message);
  }
}
