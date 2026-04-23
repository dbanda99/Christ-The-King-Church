var SPREADSHEET_ID = "PASTE_YOUR_SPREADSHEET_ID_HERE";
var MEMBERS_SHEET = "Member List";
var USERS_SHEET = "Users";
var USER_CACHE_TTL_SECONDS = 300;
var TOKEN_CACHE_TTL_SECONDS = 300;

function doPost(e) {
  try {
    var body = parseJsonBody_(e);
    var token = body.token;
    var action = body.action;
    var payload = body.payload || {};

    if (!token) {
      return jsonResponse_({ ok: false, error: "Missing identity token." });
    }

    var verifiedUser = verifyGoogleToken_(token);
    ensureAllowedUser_(verifiedUser.email);

    if (action === "session") {
      return jsonResponse_({
        ok: true,
        user: {
          email: verifiedUser.email,
          name: verifiedUser.name || verifiedUser.email
        }
      });
    }

    if (action === "listMembers") {
      return jsonResponse_({ ok: true, members: listMembers_() });
    }

    if (action === "saveMember") {
      var saved = saveMember_(payload);
      return jsonResponse_({ ok: true, member: saved });
    }

    if (action === "deleteMember") {
      deleteMember_(payload.id);
      return jsonResponse_({ ok: true });
    }

    return jsonResponse_({ ok: false, error: "Unsupported action." });
  } catch (error) {
    return jsonResponse_({
      ok: false,
      error: error && error.message ? error.message : "Unexpected server error."
    });
  }
}

function doGet() {
  return jsonResponse_({
    ok: true,
    service: "CTK Admin API",
    status: "running"
  });
}

function parseJsonBody_(e) {
  if (!e || !e.postData || !e.postData.contents) {
    return {};
  }
  return JSON.parse(e.postData.contents);
}

function getSpreadsheet_() {
  return SpreadsheetApp.openById(SPREADSHEET_ID);
}

function getSheetByName_(name) {
  var sheet = getSpreadsheet_().getSheetByName(name);
  if (!sheet) {
    throw new Error('Missing sheet: "' + name + '".');
  }
  return sheet;
}

function getRowsAsObjects_(sheet) {
  var values = sheet.getDataRange().getValues();
  if (!values.length) return [];

  var headers = values[0];
  return values.slice(1).filter(function (row) {
    return row.join("") !== "";
  }).map(function (row, index) {
    var item = { __rowNumber: index + 2 };
    headers.forEach(function (header, colIndex) {
      item[String(header)] = row[colIndex];
    });
    return item;
  });
}

function verifyGoogleToken_(token) {
  var cache = CacheService.getScriptCache();
  var cacheKey = "google_token_" + Utilities.base64EncodeWebSafe(
    Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, token)
  );
  var cached = cache.get(cacheKey);
  if (cached) {
    return JSON.parse(cached);
  }

  var response = UrlFetchApp.fetch("https://oauth2.googleapis.com/tokeninfo?id_token=" + encodeURIComponent(token), {
    muteHttpExceptions: true
  });
  var status = response.getResponseCode();
  var data = JSON.parse(response.getContentText() || "{}");

  if (status !== 200 || !data.email) {
    throw new Error("Google sign-in could not be verified.");
  }

  cache.put(cacheKey, JSON.stringify(data), TOKEN_CACHE_TTL_SECONDS);
  return data;
}

function ensureAllowedUser_(email) {
  var normalized = String(email || "").toLowerCase().trim();
  var allowedUsers = getAllowedUsersMap_();

  if (allowedUsers[normalized] !== true) {
    throw new Error("This Google account is not allowed to access the admin portal.");
  }
}

function getAllowedUsersMap_() {
  var cache = CacheService.getScriptCache();
  var cached = cache.get("allowed_users_map");
  if (cached) {
    return JSON.parse(cached);
  }

  var usersSheet = getSheetByName_(USERS_SHEET);
  var users = getRowsAsObjects_(usersSheet);
  var allowedMap = {};

  users.forEach(function (user) {
    var email = String(user.email || "").toLowerCase().trim();
    if (!email) return;
    allowedMap[email] = isTrueValue_(user.active);
  });

  cache.put("allowed_users_map", JSON.stringify(allowedMap), USER_CACHE_TTL_SECONDS);
  return allowedMap;
}

function listMembers_() {
  var sheet = getSheetByName_(MEMBERS_SHEET);
  var rows = getRowsAsObjects_(sheet);

  return rows.map(function (row) {
    return {
      id: String(row.id || ""),
      status: String(row.status || ""),
      first_name: String(row.first_name || ""),
      last_name: String(row.last_name || ""),
      phone_number: String(row.phone_number || ""),
      address: String(row.address || ""),
      created_at: String(row.created_at || ""),
      updated_at: String(row.updated_at || "")
    };
  });
}

function saveMember_(payload) {
  validateMemberPayload_(payload);

  var sheet = getSheetByName_(MEMBERS_SHEET);
  var rows = getRowsAsObjects_(sheet);
  var now = new Date().toISOString();

  if (payload.id) {
    var existing = rows.find(function (row) {
      return String(row.id) === String(payload.id);
    });

    if (!existing) {
      throw new Error("Member record not found.");
    }

    sheet.getRange(existing.__rowNumber, 1, 1, 8).setValues([[
      payload.id,
      payload.status,
      payload.first_name,
      payload.last_name,
      payload.phone_number,
      payload.address,
      existing.created_at || now,
      now
    ]]);

    return {
      id: payload.id,
      status: payload.status,
      first_name: payload.first_name,
      last_name: payload.last_name,
      phone_number: payload.phone_number,
      address: payload.address,
      created_at: existing.created_at || now,
      updated_at: now
    };
  }

  var id = Utilities.getUuid();
  sheet.appendRow([
    id,
    payload.status,
    payload.first_name,
    payload.last_name,
    payload.phone_number,
    payload.address,
    now,
    now
  ]);

  return {
    id: id,
    status: payload.status,
    first_name: payload.first_name,
    last_name: payload.last_name,
    phone_number: payload.phone_number,
    address: payload.address,
    created_at: now,
    updated_at: now
  };
}

function deleteMember_(id) {
  if (!id) {
    throw new Error("Missing member id.");
  }

  var sheet = getSheetByName_(MEMBERS_SHEET);
  var rows = getRowsAsObjects_(sheet);
  var existing = rows.find(function (row) {
    return String(row.id) === String(id);
  });

  if (!existing) {
    throw new Error("Member record not found.");
  }

  sheet.deleteRow(existing.__rowNumber);
}

function validateMemberPayload_(payload) {
  var required = ["status", "first_name", "last_name", "phone_number", "address"];
  required.forEach(function (field) {
    if (!String(payload[field] || "").trim()) {
      throw new Error("Missing required field: " + field);
    }
  });

  if (["Active", "Inactive"].indexOf(payload.status) === -1) {
    throw new Error("Status must be Active or Inactive.");
  }
}

function isTrueValue_(value) {
  var normalized = String(value == null ? "" : value).toLowerCase().trim();
  return normalized === "true" || normalized === "yes" || normalized === "1";
}

function jsonResponse_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
