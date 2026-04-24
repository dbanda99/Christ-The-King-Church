(function () {
  var SESSION_KEY = "ctk_admin_google_session";
  var MEMBERS_CACHE_KEY = "ctk_admin_members_cache";
  var memberFields = ["status", "first_name", "last_name", "phone_number", "address"];
  var state = {
    members: [],
    search: "",
    status: "all",
    sort: "last_name",
    editingId: null,
    addressController: null,
    addressDebounce: null,
    addressItems: [],
    activeAddressIndex: -1,
    formRetreats: [],
    user: null
  };

  function getConfig() {
    return window.CTK_ADMIN_CONFIG || {};
  }

  function isConfigReady() {
    var config = getConfig();
    return Boolean(config.googleClientId && config.appsScriptUrl);
  }

  function formatText(value) {
    return String(value || "").trim();
  }

  function compareValues(a, b) {
    return String(a || "").localeCompare(String(b || ""), undefined, { sensitivity: "base" });
  }

  function formatPhoneInput(value) {
    var digits = String(value || "").replace(/\D/g, "").slice(0, 10);
    if (digits.length < 4) return digits;
    if (digits.length < 7) return "(" + digits.slice(0, 3) + ") " + digits.slice(3);
    return "(" + digits.slice(0, 3) + ") " + digits.slice(3, 6) + "-" + digits.slice(6);
  }

  function normalizeRetreats(value) {
    var source = value;
    if (typeof source === "string") {
      try {
        source = source ? JSON.parse(source) : [];
      } catch (_) {
        source = [];
      }
    }
    if (!Array.isArray(source)) return [];
    return source.map(function (item) {
      return {
        name: formatText(item.name || item.retreat_name),
        date: formatText(item.date || item.retreat_date)
      };
    }).filter(function (item) {
      return item.name && item.date;
    });
  }

  function formatRetreatDate(value) {
    if (!value) return "";
    var parts = String(value).split("-");
    if (parts.length !== 3) return value;
    return parts[1] + "/" + parts[2] + "/" + parts[0];
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function setMessage(element, text, tone) {
    if (!element) return;
    element.textContent = text || "";
    element.dataset.tone = tone || "";
  }

  function setLoading(button, isLoading, label) {
    if (!button) return;
    button.disabled = isLoading;
    if (isLoading) {
      button.dataset.originalLabel = button.textContent;
      button.textContent = label || "Loading...";
    } else if (button.dataset.originalLabel) {
      button.textContent = button.dataset.originalLabel;
    }
  }

  function storeSession(session) {
    try {
      window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
    } catch (_) {}
  }

  function getStoredSession() {
    try {
      var raw = window.sessionStorage.getItem(SESSION_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (_) {
      return null;
    }
  }

  function clearSession() {
    try {
      window.sessionStorage.removeItem(SESSION_KEY);
    } catch (_) {}
  }

  function storeMembersCache(members) {
    try {
      window.sessionStorage.setItem(MEMBERS_CACHE_KEY, JSON.stringify({
        storedAt: Date.now(),
        members: members || []
      }));
    } catch (_) {}
  }

  function getMembersCache() {
    try {
      var raw = window.sessionStorage.getItem(MEMBERS_CACHE_KEY);
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      if (!parsed || !Array.isArray(parsed.members)) return null;
      return parsed;
    } catch (_) {
      return null;
    }
  }

  function parseJwtPayload(token) {
    try {
      var payload = token.split(".")[1];
      var normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
      return JSON.parse(window.atob(normalized));
    } catch (_) {
      return {};
    }
  }

  async function callApi(action, payload, token) {
    var config = getConfig();
    var response = await fetch(config.appsScriptUrl, {
      method: "POST",
      headers: {
        "Content-Type": "text/plain;charset=utf-8"
      },
      body: JSON.stringify({
        action: action,
        token: token || (state.user && state.user.token) || "",
        payload: payload || {}
      })
    });

    var data = await response.json().catch(function () {
      return { ok: false, error: "Invalid API response." };
    });

    if (!response.ok || !data.ok) {
      throw new Error(data.error || "Request failed.");
    }

    return data;
  }

  function clearAddressSuggestions() {
    state.addressItems = [];
    state.activeAddressIndex = -1;
    var list = document.getElementById("memberAddressSuggestions");
    if (!list) return;
    list.innerHTML = "";
    list.classList.add("d-none");
  }

  function renderAddressSuggestions(items) {
    var list = document.getElementById("memberAddressSuggestions");
    if (!list) return;
    state.addressItems = items.slice();
    state.activeAddressIndex = -1;
    if (!state.addressItems.length) {
      clearAddressSuggestions();
      return;
    }
    list.innerHTML = state.addressItems.map(function (item, index) {
      return '<button type="button" class="admin-address-option" data-address-index="' + index + '" role="option">' +
        "<span>" + escapeHtml(item.primary) + "</span>" +
        (item.secondary ? '<span class="admin-address-meta">' + escapeHtml(item.secondary) + "</span>" : "") +
      "</button>";
    }).join("");
    list.classList.remove("d-none");
  }

  function setActiveAddressOption(index) {
    var list = document.getElementById("memberAddressSuggestions");
    if (!list) return;
    list.querySelectorAll(".admin-address-option").forEach(function (button, buttonIndex) {
      button.classList.toggle("is-active", buttonIndex === index);
    });
    state.activeAddressIndex = index;
  }

  function selectAddressSuggestion(index) {
    var input = document.getElementById("memberAddress");
    var item = state.addressItems[index];
    if (!input || !item) return;
    input.value = item.full;
    clearAddressSuggestions();
  }

  async function fetchAddressSuggestions(query) {
    var trimmedQuery = formatText(query);
    if (trimmedQuery.length < 4) {
      clearAddressSuggestions();
      return;
    }

    if (state.addressController) {
      state.addressController.abort();
    }
    state.addressController = new AbortController();

    try {
      var endpoint = new URL("https://nominatim.openstreetmap.org/search");
      endpoint.searchParams.set("format", "jsonv2");
      endpoint.searchParams.set("addressdetails", "1");
      endpoint.searchParams.set("limit", "5");
      endpoint.searchParams.set("countrycodes", "us");
      endpoint.searchParams.set("q", trimmedQuery);

      var response = await fetch(endpoint.toString(), {
        signal: state.addressController.signal,
        headers: { Accept: "application/json" }
      });

      if (!response.ok) {
        clearAddressSuggestions();
        return;
      }

      var results = await response.json();
      renderAddressSuggestions((Array.isArray(results) ? results : []).map(function (item) {
        var parts = String(item.display_name || "").split(",");
        return {
          primary: formatText(parts.shift() || trimmedQuery),
          secondary: formatText(parts.join(",")),
          full: formatText(item.display_name || trimmedQuery)
        };
      }));
    } catch (error) {
      if (error && error.name === "AbortError") return;
      clearAddressSuggestions();
    }
  }

  function renderStats() {
    var total = document.getElementById("totalMembersStat");
    var active = document.getElementById("activeMembersStat");
    var inactive = document.getElementById("inactiveMembersStat");
    if (!total || !active || !inactive) return;
    var activeCount = state.members.filter(function (member) { return member.status === "Active"; }).length;
    total.textContent = String(state.members.length);
    active.textContent = String(activeCount);
    inactive.textContent = String(state.members.length - activeCount);
  }

  function renderRetreatSummary(member) {
    var retreats = normalizeRetreats(member.retreat_history || member.retreats);
    if (!retreats.length) {
      return '<span class="text-secondary">None</span>';
    }
    return '<div class="admin-retreat-summary">' + retreats.map(function (retreat) {
      return '<span class="admin-retreat-chip">' + escapeHtml(retreat.name) +
        ' <span>' + escapeHtml(formatRetreatDate(retreat.date)) + "</span></span>";
    }).join("") + "</div>";
  }

  function renderRetreatList() {
    var list = document.getElementById("retreatList");
    var empty = document.getElementById("noRetreatsText");
    if (!list || !empty) return;
    list.innerHTML = "";
    empty.classList.toggle("d-none", state.formRetreats.length > 0);
    state.formRetreats.forEach(function (retreat, index) {
      var item = document.createElement("div");
      item.className = "admin-retreat-item";
      item.innerHTML = [
        "<div>",
        "<strong>" + escapeHtml(retreat.name) + "</strong>",
        "<span>" + escapeHtml(formatRetreatDate(retreat.date)) + "</span>",
        "</div>",
        '<button type="button" class="btn btn-sm btn-outline-danger" data-remove-retreat="' + index + '">Remove</button>'
      ].join("");
      list.appendChild(item);
    });
  }

  function filteredMembers() {
    var searchValue = state.search.toLowerCase();
    var list = state.members.filter(function (member) {
      var matchesStatus = state.status === "all" || member.status === state.status;
      var retreatText = normalizeRetreats(member.retreat_history || member.retreats).map(function (retreat) {
        return retreat.name + " " + retreat.date;
      }).join(" ");
      var haystack = [member.first_name, member.last_name, member.phone_number, member.address, retreatText].join(" ").toLowerCase();
      var matchesSearch = !searchValue || haystack.indexOf(searchValue) !== -1;
      return matchesStatus && matchesSearch;
    });

    list.sort(function (a, b) {
      if (state.sort === "status") {
        var byStatus = compareValues(a.status, b.status);
        return byStatus || compareValues(a.last_name, b.last_name);
      }
      if (state.sort === "first_name") {
        var byFirst = compareValues(a.first_name, b.first_name);
        return byFirst || compareValues(a.last_name, b.last_name);
      }
      var byLast = compareValues(a.last_name, b.last_name);
      return byLast || compareValues(a.first_name, b.first_name);
    });

    return list;
  }

  function renderTable() {
    var tbody = document.getElementById("membersTableBody");
    var empty = document.getElementById("emptyState");
    if (!tbody || !empty) return;
    renderStats();
    var list = filteredMembers();
    tbody.innerHTML = "";
    if (!list.length) {
      empty.classList.remove("d-none");
      return;
    }
    empty.classList.add("d-none");
    list.forEach(function (member) {
      var row = document.createElement("tr");
      row.innerHTML = [
        '<td><span class="admin-status-pill" data-status="' + escapeHtml(member.status) + '">' + escapeHtml(member.status) + "</span></td>",
        "<td>" + escapeHtml(member.first_name) + "</td>",
        "<td>" + escapeHtml(member.last_name) + "</td>",
        "<td>" + escapeHtml(member.phone_number || "") + "</td>",
        "<td>" + escapeHtml(member.address || "") + "</td>",
        "<td>" + renderRetreatSummary(member) + "</td>",
        '<td class="text-end"><div class="d-inline-flex gap-2"><button type="button" class="btn btn-sm btn-outline-secondary" data-action="edit" data-id="' + escapeHtml(member.id) + '">Edit</button><button type="button" class="btn btn-sm btn-outline-danger" data-action="delete" data-id="' + escapeHtml(member.id) + '">Delete</button></div></td>'
      ].join("");
      tbody.appendChild(row);
    });
  }

  function resetForm() {
    var form = document.getElementById("memberForm");
    if (form) form.reset();
    state.editingId = null;
    document.getElementById("memberId").value = "";
    document.getElementById("memberStatus").value = "Active";
    document.getElementById("memberPhone").value = "";
    document.getElementById("memberAddress").value = "";
    document.getElementById("retreatName").value = "";
    document.getElementById("retreatDate").value = "";
    document.getElementById("memberModalTitle").textContent = "Add Member";
    state.formRetreats = [];
    renderRetreatList();
    setMessage(document.getElementById("formMessage"), "", "");
    clearAddressSuggestions();
  }

  function populateForm(member) {
    state.editingId = member.id;
    document.getElementById("memberId").value = member.id;
    document.getElementById("memberStatus").value = member.status;
    document.getElementById("memberFirstName").value = member.first_name;
    document.getElementById("memberLastName").value = member.last_name;
    document.getElementById("memberPhone").value = formatPhoneInput(member.phone_number || "");
    document.getElementById("memberAddress").value = member.address || "";
    document.getElementById("retreatName").value = "";
    document.getElementById("retreatDate").value = "";
    document.getElementById("memberModalTitle").textContent = "Edit Member";
    state.formRetreats = normalizeRetreats(member.retreat_history || member.retreats);
    renderRetreatList();
    setMessage(document.getElementById("formMessage"), "", "");
    clearAddressSuggestions();
  }

  async function loadMembers() {
    var loadingState = document.getElementById("membersLoadingState");
    var errorState = document.getElementById("membersErrorState");
    var hadExistingMembers = state.members.length > 0;

    if (loadingState && !hadExistingMembers) {
      loadingState.classList.remove("d-none");
    }
    if (errorState) {
      errorState.classList.add("d-none");
    }

    try {
      var data = await callApi("listMembers");
      state.members = data.members || [];
      storeMembersCache(state.members);
      renderTable();
    } catch (error) {
      if (errorState && !hadExistingMembers) {
        errorState.classList.remove("d-none");
      }
      throw error;
    } finally {
      if (loadingState) {
        loadingState.classList.add("d-none");
      }
    }
  }

  async function saveMember() {
    var formMessage = document.getElementById("formMessage");
    var saveButton = document.querySelector('[form="memberForm"]');
    var pendingRetreat = {
      name: formatText(document.getElementById("retreatName").value),
      date: formatText(document.getElementById("retreatDate").value)
    };

    if (pendingRetreat.name || pendingRetreat.date) {
      if (!pendingRetreat.name || !pendingRetreat.date) {
        setMessage(formMessage, "Please complete the retreat name and date, or clear those fields before saving.", "danger");
        return;
      }
      state.formRetreats.push(pendingRetreat);
      document.getElementById("retreatName").value = "";
      document.getElementById("retreatDate").value = "";
      renderRetreatList();
    }

    var payload = {
      id: formatText(document.getElementById("memberId").value),
      status: document.getElementById("memberStatus").value,
      first_name: formatText(document.getElementById("memberFirstName").value),
      last_name: formatText(document.getElementById("memberLastName").value),
      phone_number: formatPhoneInput(document.getElementById("memberPhone").value),
      address: formatText(document.getElementById("memberAddress").value),
      retreat_history: state.formRetreats.slice()
    };

    var invalidField = memberFields.find(function (field) {
      return !formatText(payload[field]);
    });
    if (invalidField) {
      setMessage(formMessage, "Please complete every field before saving.", "danger");
      return;
    }

    setLoading(saveButton, true, "Saving...");
    setMessage(formMessage, "", "");
    try {
      var data = await callApi("saveMember", payload);
      if (state.editingId) {
        state.members = state.members.map(function (member) {
          return member.id === state.editingId ? data.member : member;
        });
      } else {
        state.members.unshift(data.member);
      }
      storeMembersCache(state.members);
      renderTable();
      bootstrap.Modal.getInstance(document.getElementById("memberModal")).hide();
      resetForm();
    } catch (error) {
      setMessage(formMessage, error.message || "Unable to save this member right now.", "danger");
    } finally {
      setLoading(saveButton, false);
    }
  }

  function addRetreatToForm() {
    var nameInput = document.getElementById("retreatName");
    var dateInput = document.getElementById("retreatDate");
    var formMessage = document.getElementById("formMessage");
    var retreat = {
      name: formatText(nameInput.value),
      date: formatText(dateInput.value)
    };

    if (!retreat.name || !retreat.date) {
      setMessage(formMessage, "Please enter both retreat name and date before adding it.", "danger");
      return;
    }

    state.formRetreats.push(retreat);
    nameInput.value = "";
    dateInput.value = "";
    setMessage(formMessage, "", "");
    renderRetreatList();
    nameInput.focus();
  }

  async function deleteMember(id) {
    var member = state.members.find(function (item) { return item.id === id; });
    if (!member) return;
    if (!window.confirm("Delete " + member.first_name + " " + member.last_name + " from the directory?")) return;
    try {
      await callApi("deleteMember", { id: id });
      state.members = state.members.filter(function (item) { return item.id !== id; });
      storeMembersCache(state.members);
      renderTable();
    } catch (error) {
      window.alert(error.message || "Unable to delete this member right now.");
    }
  }

  async function validateSession(session) {
    var data = await callApi("session", {}, session.token);
    return {
      token: session.token,
      email: data.user.email,
      name: data.user.name || data.user.email
    };
  }

  function renderConfigWarnings() {
    document.querySelectorAll("[data-admin-config-warning]").forEach(function (element) {
      element.classList.toggle("d-none", isConfigReady());
    });
  }

  function waitForGoogleIdentity(timeoutMs) {
    return new Promise(function (resolve, reject) {
      var startedAt = Date.now();

      function check() {
        if (window.google && window.google.accounts && window.google.accounts.id) {
          resolve();
          return;
        }

        if (Date.now() - startedAt >= timeoutMs) {
          reject(new Error("Google Sign-In could not be loaded."));
          return;
        }

        window.setTimeout(check, 120);
      }

      check();
    });
  }

  function initGoogleSignIn() {
    var config = getConfig();
    var loginMessage = document.getElementById("loginMessage");
    var mount = document.getElementById("googleSignInMount");

    function handleCredentialResponse(response) {
      if (!response || !response.credential) {
        setMessage(loginMessage, "Google Sign-In did not return a valid credential.", "danger");
        return;
      }

      var payload = parseJwtPayload(response.credential);
      var pendingSession = {
        token: response.credential,
        email: payload.email || "",
        name: payload.name || payload.email || ""
      };

      setMessage(loginMessage, "Verifying access...", "");
      validateSession(pendingSession).then(function (verifiedSession) {
        verifiedSession.verifiedAt = Date.now();
        storeSession(verifiedSession);
        window.location.href = "members.html";
      }).catch(function (error) {
        clearSession();
        setMessage(loginMessage, error.message || "Your Google account is not authorized.", "danger");
      });
    }

    window.google.accounts.id.initialize({
      client_id: config.googleClientId,
      callback: handleCredentialResponse,
      auto_select: false
    });

    if (mount) {
      window.google.accounts.id.renderButton(mount, {
        theme: "outline",
        size: "large",
        shape: "pill",
        width: 220,
        text: "signin_with"
      });
    }
  }

  function bindAddressAutocomplete() {
    var addressInput = document.getElementById("memberAddress");
    var suggestions = document.getElementById("memberAddressSuggestions");
    if (!addressInput || !suggestions) return;

    addressInput.addEventListener("input", function () {
      window.clearTimeout(state.addressDebounce);
      state.addressDebounce = window.setTimeout(function () {
        fetchAddressSuggestions(addressInput.value);
      }, 220);
    });

    addressInput.addEventListener("focus", function () {
      if (formatText(addressInput.value).length >= 4) {
        fetchAddressSuggestions(addressInput.value);
      }
    });

    addressInput.addEventListener("keydown", function (event) {
      if (!state.addressItems.length) return;
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setActiveAddressOption(Math.min(state.activeAddressIndex + 1, state.addressItems.length - 1));
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setActiveAddressOption(Math.max(state.activeAddressIndex - 1, 0));
      }
      if (event.key === "Enter" && state.activeAddressIndex >= 0) {
        event.preventDefault();
        selectAddressSuggestion(state.activeAddressIndex);
      }
      if (event.key === "Escape") {
        clearAddressSuggestions();
      }
    });

    suggestions.addEventListener("click", function (event) {
      var option = event.target.closest("[data-address-index]");
      if (!option) return;
      selectAddressSuggestion(Number(option.getAttribute("data-address-index")));
    });

    document.addEventListener("click", function (event) {
      if (!event.target.closest(".admin-address-field")) {
        clearAddressSuggestions();
      }
    });
  }

  async function initLoginPage() {
    if (!document.getElementById("googleSignInMount")) return;
    renderConfigWarnings();
    if (!isConfigReady()) return;

    var existing = getStoredSession();
    if (existing) {
      try {
        await validateSession(existing);
        window.location.href = "members.html";
        return;
      } catch (_) {
        clearSession();
      }
    }

    try {
      setMessage(document.getElementById("loginMessage"), "Loading Google Sign-In...", "");
      await waitForGoogleIdentity(8000);
      setMessage(document.getElementById("loginMessage"), "", "");
      initGoogleSignIn();
    } catch (error) {
      setMessage(
        document.getElementById("loginMessage"),
        (error && error.message ? error.message : "Google Sign-In could not be loaded.") + " Check the OAuth client origin and browser console.",
        "danger"
      );
    }
  }

  function bindMembersPage() {
    var search = document.getElementById("memberSearch");
    var statusFilter = document.getElementById("statusFilter");
    var sortFilter = document.getElementById("sortFilter");
    var addButton = document.getElementById("addMemberBtn");
    var logoutButton = document.getElementById("logoutBtn");
    var tableBody = document.getElementById("membersTableBody");
    var memberPhone = document.getElementById("memberPhone");
    var form = document.getElementById("memberForm");
    var modalElement = document.getElementById("memberModal");
    var addRetreatButton = document.getElementById("addRetreatBtn");
    var retreatList = document.getElementById("retreatList");

    search.addEventListener("input", function () {
      state.search = formatText(search.value);
      renderTable();
    });
    statusFilter.addEventListener("change", function () {
      state.status = statusFilter.value;
      renderTable();
    });
    sortFilter.addEventListener("change", function () {
      state.sort = sortFilter.value;
      renderTable();
    });
    addButton.addEventListener("click", function () {
      resetForm();
      bootstrap.Modal.getOrCreateInstance(modalElement).show();
    });
    logoutButton.addEventListener("click", function () {
      clearSession();
      window.location.href = "index.html";
    });
    memberPhone.addEventListener("input", function () {
      memberPhone.value = formatPhoneInput(memberPhone.value);
    });
    addRetreatButton.addEventListener("click", addRetreatToForm);
    retreatList.addEventListener("click", function (event) {
      var button = event.target.closest("[data-remove-retreat]");
      if (!button) return;
      state.formRetreats.splice(Number(button.getAttribute("data-remove-retreat")), 1);
      renderRetreatList();
    });
    tableBody.addEventListener("click", function (event) {
      var button = event.target.closest("button[data-action]");
      if (!button) return;
      var id = button.getAttribute("data-id");
      var action = button.getAttribute("data-action");
      if (action === "edit") {
        var member = state.members.find(function (item) { return item.id === id; });
        if (!member) return;
        populateForm(member);
        bootstrap.Modal.getOrCreateInstance(modalElement).show();
      }
      if (action === "delete") {
        deleteMember(id);
      }
    });
    form.addEventListener("submit", function (event) {
      event.preventDefault();
      saveMember();
    });
    modalElement.addEventListener("hidden.bs.modal", function () {
      resetForm();
    });
    bindAddressAutocomplete();
  }

  async function initMembersPage() {
    if (!document.getElementById("membersTableBody")) return;
    renderConfigWarnings();
    if (!isConfigReady()) {
      var loading = document.getElementById("membersLoadingState");
      if (loading) loading.classList.add("d-none");
      return;
    }

    var session = getStoredSession();
    if (!session || !session.token) {
      window.location.href = "index.html";
      return;
    }

    var recentlyVerified = session.verifiedAt && (Date.now() - session.verifiedAt < 15 * 60 * 1000);
    if (recentlyVerified) {
      state.user = session;
    } else {
      try {
        state.user = await validateSession(session);
        state.user.verifiedAt = Date.now();
        storeSession(state.user);
      } catch (_) {
        clearSession();
        window.location.href = "index.html";
        return;
      }
    }

    document.getElementById("adminSessionEmail").textContent = state.user.email || "Approved User";
    bindMembersPage();
    var cachedMembers = getMembersCache();
    if (cachedMembers && Array.isArray(cachedMembers.members) && cachedMembers.members.length) {
      state.members = cachedMembers.members;
      renderTable();
      document.getElementById("membersLoadingState").classList.add("d-none");
    }
    try {
      await loadMembers();
    } catch (error) {
      window.console.error(error);
    }
  }

  initLoginPage();
  initMembersPage();
})();
