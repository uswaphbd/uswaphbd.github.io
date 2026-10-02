/**
 * UI Manager Module
 * Handles all UI interactions and updates
 */

const UIManager = (function() {
    
    /**
     * Show loading spinner with message
     */
    function showLoading(message = "Loading...") {
        const loading = document.getElementById("loading");
        const status = document.getElementById("status");
        
        if (loading) {
            loading.classList.remove("d-none");
        }
        if (status) {
            status.textContent = message;
            status.className = "status-text ms-2";
        }
    }

    /**
     * Hide loading spinner
     */
    function hideLoading() {
        const loading = document.getElementById("loading");
        const status = document.getElementById("status");
        
        if (loading) {
            loading.classList.add("d-none");
        }
        if (status) {
            status.textContent = "";
        }
    }

    /**
     * Show error message
     */
    function showError(message) {
        const status = document.getElementById("status");
        if (status) {
            status.textContent = message;
            status.className = "status-text ms-2 text-danger";
        }
        console.error(message);
    }

    /**
     * Show success message
     */
    function showSuccess(message) {
        const status = document.getElementById("status");
        if (status) {
            status.textContent = message;
            status.className = "status-text ms-2 text-success";
        }
        console.log(message);
    }

    /**
     * Show error in popup panel
     */
    function showPopupError(type, message) {
        const errorDiv = document.getElementById(`popup-error-${type}`);
        if (errorDiv) {
            errorDiv.textContent = message;
            errorDiv.style.display = 'block';
            
            // Auto-hide after 5 seconds
            setTimeout(() => {
                hidePopupError(type);
            }, 5000);
        }
    }

    /**
     * Hide error in popup panel
     */
    function hidePopupError(type) {
        const errorDiv = document.getElementById(`popup-error-${type}`);
        if (errorDiv) {
            errorDiv.style.display = 'none';
            errorDiv.textContent = '';
        }
    }

    /**
     * Update balance display
     */
    function updateBalance(elementId, amount) {
        const element = document.getElementById(elementId);
        if (element) {
            element.textContent = amount.toFixed(3);
        }
    }

    /**
     * Update price display
     */
    function updatePrice(elementId, price) {
        const element = document.getElementById(elementId);
        if (element) {
            element.textContent = `$${price.toFixed(4)}`;
        }
    }

    /**
     * Update liquidity display
     */
    function updateLiquidity(elementId, amount) {
        const element = document.getElementById(elementId);
        if (element) {
            // Use Math.floor to display liquidity with 3 decimals
            element.textContent = (Math.floor(amount * 1000) / 1000).toFixed(3);
        }
    }

    /**
     * Update swap display (output, fee, min receive)
     */
    function updateSwapDisplay(swapData) {
        // Update output quantity
        const outputQty = document.getElementById("outputquantity");
        if (outputQty) {
            outputQty.value = swapData.expected.toFixed(3);
        }

        // Update fee
        const expectedFee = document.getElementById("expectedfee");
        if (expectedFee) {
            expectedFee.textContent = swapData.fee.toFixed(3);
        }

        const expectedPer = document.getElementById("expectedper");
        if (expectedPer) {
            expectedPer.textContent = swapData.feePercent.toFixed(2);
        }

        // Update min receive
        const slipageQty = document.getElementById("slipageqty");
        if (slipageQty) {
            slipageQty.textContent = swapData.minReceive.toFixed(3);
        }
    }

    /**
     * Clear swap inputs
     */
    function clearSwapInputs() {
        const inputQty = document.getElementById("inputquantity");
        const outputQty = document.getElementById("outputquantity");
        
        if (inputQty) inputQty.value = "";
        if (outputQty) outputQty.value = "";
        
        updateSwapDisplay({
            expected: 0,
            fee: 0,
            feePercent: 0,
            minReceive: 0
        });
    }

    /**
     * Enable swap button
     */
    function enableSwapButton() {
        const swapBtn = document.getElementById("swap");
        if (swapBtn) {
            swapBtn.disabled = false;
        }

        // Enable auth method radios (Hive Auth only if this browser actually supports it)
        const authRadios = document.querySelectorAll('input[name="txtype"]');
        if (authRadios) {
            authRadios.forEach(radio => {
                if (radio.value === "Hive Auth" && !HiveAuthManager.isSupported()) {
                    radio.disabled = true;
                    return;
                }
                radio.disabled = false;
            });
        }
    }

    /**
     * Disable swap button
     */
    function disableSwapButton() {
        const swapBtn = document.getElementById("swap");
        if (swapBtn) {
            swapBtn.disabled = true;
        }
    }

    /**
     * Update swap history table
     */
    async function updateSwapHistory() {
        const username = WalletManager.getCurrentUser();
        if (!username) {
            const tbody = document.getElementById("swapHistoryTable");
            if (tbody) {
                tbody.innerHTML = `
                    <tr>
                        <td colspan="6" class="text-center" style="padding: 2rem; color: var(--text-secondary);">
                            Load your balance to view recent swaps
                        </td>
                    </tr>
                `;
            }
            return;
        }

        const history = await SwapManager.loadSwapHistory(username);
        const tbody = document.getElementById("swapHistoryTable");
        
        if (!tbody) return;

        if (history.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="6" class="text-center" style="padding: 2rem; color: var(--text-secondary);">
                        No swap history found
                    </td>
                </tr>
            `;
            return;
        }

        // Everything below comes from localStorage or the chain, so it is
        // escaped before it reaches innerHTML.
        const esc = Utils.escapeHtml;

        const txLink = (txId) => {
            if (typeof txId !== 'string' || !txId) return '-';
            return `<a href="https://hivehub.dev/tx/${encodeURIComponent(txId)}" target="_blank" rel="noopener" style="color: var(--primary-color); text-decoration: none;">
                    ${esc(txId.substring(0, 8))}...
                </a>`;
        };

        tbody.innerHTML = history.map(swap => {
            const date = new Date(swap.timestamp);
            const dateStr = esc(date.toLocaleString());
            
            // A pending swap whose Hive-Engine payout was rejected (layer 2, not
            // just "not confirmed yet") gets its own look, distinct from a plain
            // in-progress pending - see confirmBridgeTransferOnHiveEngine() in swap.js.
            const hasEngineError = swap.status === 'pending' && swap.engineError;

            const statusClass = swap.status === 'completed' ? 'text-success' :
                              swap.status === 'refunded' ? 'text-warning' :
                              swap.status === 'not-sent' ? 'text-danger' :
                              swap.status === 'failed' ? 'text-danger' :
                              hasEngineError ? 'text-danger' :
                              'text-info';

            // 'failed' = the user's SWAP.HBD deposit was rejected on Hive-Engine
            const statusText = swap.status === 'completed' ? '✓ Completed' :
                             swap.status === 'refunded' ? '↩ Refunded' :
                             swap.status === 'not-sent' ? '✗ Not Sent' :
                             swap.status === 'failed'
                                ? `<span title="Hive-Engine: ${esc(swap.engineError || 'transfer rejected')}">✗ Failed</span>` :
                             hasEngineError
                                ? `<span title="Hive-Engine: ${esc(swap.engineError)}">⚠ Payout Error</span>`
                                : '⏳ Pending';

            const txIdSent = txLink(swap.txIdSent);
            const txIdReceived = txLink(swap.txIdReceived);

            // Format amounts to 3 decimals
            const formatAmount = (amount) => {
                if (!amount) return '-';
                const text = String(amount);
                const match = text.match(/([\d.]+)\s*([\w.]+)/);
                if (match) {
                    const value = parseFloat(match[1]).toFixed(3);
                    return esc(`${value} ${match[2]}`);
                }
                return esc(text);
            };

            return `
                <tr>
                    <td>${dateStr}</td>
                    <td>${txIdSent}</td>
                    <td>${formatAmount(swap.amountSent)}</td>
                    <td>${txIdReceived}</td>
                    <td>${formatAmount(swap.amountReceived)}</td>
                    <td class="${statusClass}">${statusText}</td>
                </tr>
            `;
        }).join('');
    }

    /**
     * Update the bridge-wide history tables (last 3 HBD + last 3 SWAP.HBD
     * payouts made by @uswap to anyone). Ported from uswapapp - kept as a
     * separate panel from "My Recent Swaps" above, which is per-user.
     */
    function updateBridgeHistory(hiveEntries, swapHiveEntries) {
        const card = document.getElementById("historycard");
        const hiveBody = document.getElementById("historyHive");
        const swapHiveBody = document.getElementById("historySwapHive");
        if (!card || !hiveBody || !swapHiveBody) return;

        const hasData = (hiveEntries && hiveEntries.length > 0) || (swapHiveEntries && swapHiveEntries.length > 0);
        if (!hasData) {
            card.classList.add("d-none");
            return;
        }
        card.classList.remove("d-none");

        const renderRows = (entries, type, explorerBase) => {
            if (!entries || entries.length === 0) {
                return `
                    <tr>
                        <td colspan="5" class="text-center" style="padding: 1.5rem; color: var(--text-secondary);">
                            No recent activity
                        </td>
                    </tr>
                `;
            }
            // Chain data - escape before it reaches innerHTML
            const esc = Utils.escapeHtml;
            return entries.map(entry => `
                <tr>
                    <td><a href="https://peakd.com/@${encodeURIComponent(entry.to)}" target="_blank" rel="noopener" style="color: var(--primary-color); text-decoration: none;">@${esc(entry.to)}</a></td>
                    <td>${esc(Utils.parseNumber(entry.amount, 0).toFixed(3))}</td>
                    <td>${esc(type)}</td>
                    <td>${esc(new Date(entry.timestamp).toLocaleString())}</td>
                    <td><a href="${explorerBase}${encodeURIComponent(entry.trx)}" target="_blank" rel="noopener" style="color: var(--text-secondary); text-decoration: none;" title="View transaction">↗</a></td>
                </tr>
            `).join('');
        };

        hiveBody.innerHTML = renderRows(hiveEntries, "HBD", "https://hivehub.dev/tx/");
        swapHiveBody.innerHTML = renderRows(swapHiveEntries, "SWAP.HBD", "https://he.dtools.dev/tx/");
    }

    /**
     * Show app versions in the footer.
     *
     * Frontend: always CONFIG.FRONTEND_VERSION - this build is what is running.
     * Backend: resolved by SwapManager, which prefers a version published in
     * hbd.json and falls back to CONFIG.BACKEND_VERSION. The tooltip names the
     * source that actually won, so a fallback is never mistaken for live data.
     *
     * Called on init and again after every hbd.json fetch (see
     * SwapManager.refreshVersionDisplay), so a version that changes mid-session
     * is reflected without a reload.
     */
    function updateVersions() {
        const frontendEl = document.getElementById("frontendVersion");
        const backendEl = document.getElementById("backendVersion");

        if (frontendEl) {
            frontendEl.textContent = CONFIG.FRONTEND_VERSION;
            frontendEl.title = "From config.js (FRONTEND_VERSION)";
        }
        if (backendEl) {
            const resolved = SwapManager.getBackendVersion();
            const source = SwapManager.getBackendVersionSource
                ? SwapManager.getBackendVersionSource()
                : null;

            backendEl.textContent = resolved || CONFIG.BACKEND_VERSION || "-";
            backendEl.title = source === "hbd.json"
                ? "Reported live by the bridge in hbd.json"
                : "From config.js (BACKEND_VERSION) - hbd.json did not publish a version";
        }
    }

    /**
     * ==================== THEME (Light/Dark) ====================
     * Ported from uswapapp's dark/light toggle. Unlike uswapapp (two full
     * stylesheets), uswapui's CSS is variable-driven, so we just flip a
     * `data-theme` attribute on <html> and let modern-dark.css's
     * `[data-theme="light"]` block override the tokens.
     * The initial value is applied synchronously in <head> (see index.html)
     * to avoid a flash of the wrong theme; this just keeps it in sync after load.
     */
    function setTheme(theme) {
        const normalized = theme === "light" ? "light" : "dark";
        document.documentElement.setAttribute("data-theme", normalized);
        try {
            localStorage.setItem("theme", normalized);
        } catch (e) {
            // localStorage unavailable (private mode, etc.) - theme just won't persist
        }
        updateThemeButtons(normalized);
    }

    function updateThemeButtons(theme) {
        const darkBtn = document.getElementById("changeThemeDark");
        const lightBtn = document.getElementById("changeThemeLight");
        if (darkBtn) darkBtn.classList.toggle("active", theme === "dark");
        if (lightBtn) lightBtn.classList.toggle("active", theme === "light");
    }

    function initializeTheme() {
        // <head> already set data-theme before first paint; just sync the buttons.
        const current = document.documentElement.getAttribute("data-theme") || "dark";
        updateThemeButtons(current);
    }

    /**
     * Show the minimum swap in the token actually being sent - the minimum
     * applies to the input amount, so "1 HBD" was wrong for SWAP.HBD -> HBD.
     */
    function updateMinimum(fromToken) {
        const minimumElement = document.getElementById("minimum");
        if (minimumElement) {
            minimumElement.textContent = `${CONFIG.MINIMUM_SWAP} ${fromToken || "HBD"}`;
        }
    }

    /**
     * Show or clear the banner that explains why swapping is blocked
     * (operator kill switch, or liquidity below the minimum).
     * Pass null to clear it.
     */
    function setSwapBlocked(message) {
        const el = document.getElementById("swapBlockedNotice");
        if (!el) return;

        if (message) {
            el.textContent = message;
            el.classList.remove("d-none");
        } else {
            el.textContent = "";
            el.classList.add("d-none");
        }
    }

    /**
     * Show/hide API panel
     */
    function toggleAPIPanel(type, show) {
        const container = document.getElementById(`popup-container-${type}`);
        if (container) {
            container.style.display = show ? 'flex' : 'none';
            if (show) {
                // Clear any previous errors when opening
                hidePopupError(type);
                renderAPIList(type);
            }
        }
    }

    /**
     * Create add node input row
     */
    function createAddNodeRow(type) {
        const addRow = document.createElement('tr');
        addRow.style.cssText = 'background: rgba(255, 255, 255, 0.05); border-top: 2px solid var(--glass-border);';
        addRow.className = 'add-node-row';
        
        const inputCell = document.createElement('td');
        inputCell.colSpan = 2;
        inputCell.style.padding = '12px';
        
        const input = document.createElement('input');
        input.type = 'text';
        input.placeholder = `Add custom ${type.toUpperCase()} node URL (e.g., https://api.example.com)`;
        input.className = 'form-control';
        input.id = `add-node-input-${type}`;
        input.style.cssText = 'width: 100%; background: var(--input-bg); border: 1px solid var(--input-border); color: var(--text-primary); padding: 8px 12px; border-radius: 8px; font-size: 13px;';
        
        inputCell.appendChild(input);
        
        const buttonCell = document.createElement('td');
        buttonCell.style.padding = '12px';
        const addBtn = document.createElement('button');
        addBtn.textContent = 'Add';
        addBtn.className = 'btn-add-node';
        addBtn.style.cssText = 'background: var(--primary-gradient); color: white; border: none; padding: 8px 16px; border-radius: 8px; cursor: pointer; font-weight: 600; width: 100%; font-size: 13px;';
        addBtn.title = 'Add custom node';
        
        addBtn.onclick = async () => {
            const url = input.value.trim();
            if (!url) {
                showPopupError(type, 'Please enter a valid URL');
                return;
            }
            
            if (!url.startsWith('http://') && !url.startsWith('https://')) {
                showPopupError(type, 'URL must start with http:// or https://');
                return;
            }
            
            // Hide any previous errors
            hidePopupError(type);
            
            // Disable button and show loading
            addBtn.disabled = true;
            addBtn.textContent = 'Validating...';
            addBtn.style.opacity = '0.6';
            
            // Validate node type by checking API
            const result = await window.apiManager.addAPI(type, url);
            
            // Re-enable button
            addBtn.disabled = false;
            addBtn.textContent = 'Add';
            addBtn.style.opacity = '1';
            
            if (result.success) {
                input.value = '';
                renderAPIList(type);
                UIManager.showSuccess('Custom node added successfully');
            } else {
                showPopupError(type, result.error || 'Failed to add node');
            }
        };
        
        // Allow Enter key to add
        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                addBtn.click();
            }
        });
        
        buttonCell.appendChild(addBtn);
        
        addRow.appendChild(inputCell);
        addRow.appendChild(buttonCell);
        
        return addRow;
    }

    /**
     * API Panel UI Logic
     */
    function renderAPIList(type) {
        const tableId = type === 'hive' ? 'api-list-hive' : 'api-list-engine';
        const tbody = document.querySelector(`#${tableId} tbody`);
        
        if (!tbody) {
            console.error(`Table body not found for ${tableId}`);
            return;
        }

        const apis = window.apiManager.getAPIs(type);
        tbody.innerHTML = '';
        
        // First, add the input row at the top so it appears immediately
        const addRow = createAddNodeRow(type);
        tbody.appendChild(addRow);
        
        // Store nodes with their rows for sorting later
        const nodeData = [];
        
        // Create and display all nodes immediately with "Checking..." status
        apis.forEach(url => {
            const tr = document.createElement('tr');
            const urlCell = document.createElement('td');
            const statusCell = document.createElement('td');
            const actionCell = document.createElement('td');
            
            urlCell.textContent = url;
            urlCell.style.cursor = 'pointer';
            statusCell.textContent = 'Checking...';
            statusCell.style.width = '100px';
            statusCell.style.textAlign = 'center';
            statusCell.style.color = 'var(--text-secondary)';
            actionCell.style.width = '80px';
            actionCell.style.textAlign = 'center';
            
            // Add remove button for custom nodes or label for default nodes
            if (!window.apiManager.isDefault(type, url)) {
                const removeBtn = document.createElement('button');
                removeBtn.textContent = '✕';
                removeBtn.className = 'btn-remove-node';
                removeBtn.style.cssText = 'background: var(--danger-color); color: white; border: none; padding: 4px 10px; border-radius: 6px; cursor: pointer; font-size: 16px; font-weight: bold;';
                removeBtn.title = 'Remove custom node';
                removeBtn.onclick = (e) => {
                    e.stopPropagation();
                    if (confirm(`Remove custom node:\n${url}?`)) {
                        window.apiManager.removeAPI(type, url);
                        renderAPIList(type);
                        UIManager.showSuccess('Custom node removed');
                    }
                };
                actionCell.appendChild(removeBtn);
            } else {
                // Show default badge for default nodes
                const badge = document.createElement('span');
                badge.textContent = 'Default';
                badge.style.cssText = 'font-size: 11px; color: var(--text-secondary); font-weight: 500; text-transform: uppercase; letter-spacing: 0.5px;';
                actionCell.appendChild(badge);
            }
            
            // Click to select this node
            const selectNode = () => {
                // Persist the choice; the page reloads below and APIManager
                // builds the Hive / Engine clients from it on startup.
                window.apiManager.setSelectedNode(type, url);

                // Close popup
                toggleAPIPanel(type, false);
                
                // Show success message
                UIManager.showSuccess(`${type.toUpperCase()} node changed to: ${url}`);
                
                // Reload after a delay
                setTimeout(() => location.reload(), 1500);
            };
            
            urlCell.onclick = selectNode;
            statusCell.onclick = selectNode;
            
            tr.appendChild(urlCell);
            tr.appendChild(statusCell);
            tr.appendChild(actionCell);
            
            // Add row to table immediately
            tbody.appendChild(tr);
            
            // Store for later sorting
            nodeData.push({ tr, statusCell, url, status: 2 }); // 0=Working, 1=Fail, 2=Checking
        });
        
        // Check status for all nodes asynchronously
        const checkPromises = nodeData.map(async (node) => {
            try {
                const response = await axios.get(node.url, { timeout: 5000 });
                if (response.status === 200) {
                    node.statusCell.textContent = 'Working';
                    node.statusCell.style.color = 'var(--success-color)';
                    node.status = 0;
                } else {
                    node.statusCell.textContent = 'Fail';
                    node.statusCell.style.color = 'var(--danger-color)';
                    node.status = 1;
                }
            } catch (error) {
                node.statusCell.textContent = 'Fail';
                node.statusCell.style.color = 'var(--danger-color)';
                node.status = 1;
            }
            return node;
        });
        
        // After all checks complete, sort the list
        Promise.all(checkPromises).then(nodes => {
            // Sort: Working (0) first, then Fail (1), then Checking (2)
            nodes.sort((a, b) => a.status - b.status);
            
            // Remove all node rows (keep add row at top)
            while (tbody.children.length > 1) {
                tbody.removeChild(tbody.lastChild);
            }
            
            // Append sorted nodes
            nodes.forEach(node => {
                tbody.appendChild(node.tr);
            });
        });
    }
    
    /**
     * Initialize custom select dropdowns
     */
    function initializeCustomSelects() {
        document.querySelectorAll('.token-select').forEach(select => {
            if (select.nextSibling?.classList?.contains('custom-select-wrapper')) {
                return; // Already initialized
            }

            const wrapper = document.createElement('div');
            wrapper.className = 'custom-select-wrapper';
            
            const button = document.createElement('div');
            button.className = 'custom-select-button';
            button.textContent = select.options[select.selectedIndex].text;
            button.tabIndex = 0;
            
            if (select.disabled) {
                button.classList.add('disabled');
            }
            
            const dropdown = document.createElement('div');
            dropdown.className = 'custom-select-dropdown';
            
            // Function to update button text and selected state
            const updateCustomSelect = () => {
                button.textContent = select.options[select.selectedIndex].text;
                
                // Update selected option styling
                dropdown.querySelectorAll('.custom-select-option').forEach(opt => {
                    opt.classList.remove('selected');
                    if (opt.dataset.value === select.value) {
                        opt.classList.add('selected');
                    }
                });
            };
            
            // Listen for programmatic changes to the native select
            select.addEventListener('change', () => {
                updateCustomSelect();
            });
            
            // Create options
            Array.from(select.options).forEach(option => {
                const optionDiv = document.createElement('div');
                optionDiv.className = 'custom-select-option';
                optionDiv.textContent = option.text;
                optionDiv.dataset.value = option.value;
                
                if (option.selected) {
                    optionDiv.classList.add('selected');
                }
                
                optionDiv.addEventListener('click', () => {
                    // Update native select
                    select.value = option.value;
                    select.dispatchEvent(new Event('change', { bubbles: true }));
                    
                    // Update button text
                    button.textContent = option.text;
                    
                    // Update selected option
                    dropdown.querySelectorAll('.custom-select-option').forEach(opt => {
                        opt.classList.remove('selected');
                    });
                    optionDiv.classList.add('selected');
                    
                    // Close dropdown
                    dropdown.classList.remove('active');
                    button.classList.remove('active');
                });
                
                dropdown.appendChild(optionDiv);
            });
            
            wrapper.appendChild(button);
            wrapper.appendChild(dropdown);
            
            // Insert wrapper after select
            select.parentNode.insertBefore(wrapper, select.nextSibling);
            
            // Toggle dropdown
            button.addEventListener('click', (e) => {
                if (!select.disabled) {
                    e.stopPropagation();
                    const isActive = dropdown.classList.contains('active');
                    
                    // Close all other dropdowns
                    document.querySelectorAll('.custom-select-dropdown.active').forEach(d => {
                        d.classList.remove('active');
                    });
                    document.querySelectorAll('.custom-select-button.active').forEach(b => {
                        b.classList.remove('active');
                    });
                    
                    // Toggle this dropdown
                    if (!isActive) {
                        dropdown.classList.add('active');
                        button.classList.add('active');
                    }
                }
            });
            
            // Keyboard navigation
            button.addEventListener('keydown', (e) => {
                if (!select.disabled) {
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        button.click();
                    } else if (e.key === 'Escape') {
                        dropdown.classList.remove('active');
                        button.classList.remove('active');
                    }
                }
            });
        });
        
        // Close dropdowns when clicking outside
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.custom-select-wrapper')) {
                document.querySelectorAll('.custom-select-dropdown.active').forEach(dropdown => {
                    dropdown.classList.remove('active');
                });
                document.querySelectorAll('.custom-select-button.active').forEach(button => {
                    button.classList.remove('active');
                });
            }
        });
    }

    /**
     * Setup event listeners
     */
    function setupEventListeners() {
        // Load saved username from localStorage
        const usernameInput = document.getElementById("username");
        const savedUsername = localStorage.getItem('hiveUsername');
        if (savedUsername && usernameInput) {
            usernameInput.value = savedUsername;
        }
        
        // Save username when it changes
        if (usernameInput) {
            usernameInput.addEventListener('blur', () => {
                const username = usernameInput.value.trim();
                if (username) {
                    localStorage.setItem('hiveUsername', username);
                } else {
                    localStorage.removeItem('hiveUsername');
                }
            });
        }
        
        // Load balance button
        const checkBalanceBtn = document.getElementById("checkbalance");
        if (checkBalanceBtn) {
            checkBalanceBtn.addEventListener("click", async () => {
                const username = document.getElementById("username").value.trim();
                if (username) {
                    // Save username when loading balance
                    localStorage.setItem('hiveUsername', username);
                    await WalletManager.loadBalance(username);
                }
            });
        }

        // Input quantity change
        const inputQty = document.getElementById("inputquantity");
        if (inputQty) {
            const debouncedUpdate = Utils.debounce((amount, fromToken, toToken, slippage) => {
                SwapManager.updateSwapCalculation(amount, fromToken, toToken, slippage);
            }, 300);

            inputQty.addEventListener("input", (e) => {
                const amount = Utils.parseNumber(e.target.value, 0);
                const fromToken = document.getElementById("input").value;
                const toToken = document.getElementById("output").value;
                const slippage = document.querySelector('input[name="my-radio-group"]:checked')?.value || 0.02;
                
                // Run full calculation with debounce
                debouncedUpdate(amount, fromToken, toToken, slippage);
                
                // Also trigger immediate validation (without debounce) for button state
                SwapManager.validateButton(amount, fromToken, toToken);
            });
        }

        // Token select change
        const inputSelect = document.getElementById("input");
        if (inputSelect) {
            inputSelect.addEventListener("change", () => {
                const outputSelect = document.getElementById("output");
                if (outputSelect) {
                    outputSelect.value = inputSelect.value === "HBD" ? "SWAP.HBD" : "HBD";
                    // Trigger change event so custom dropdown updates
                    outputSelect.dispatchEvent(new Event('change'));
                }
                
                const amount = parseFloat(inputQty?.value) || 0;
                const slippage = document.querySelector('input[name="my-radio-group"]:checked')?.value || 0.02;
                SwapManager.updateSwapCalculation(amount, inputSelect.value, outputSelect.value, slippage);
                
                // Update fee ticker
                document.getElementById("feeticker").textContent = inputSelect.value;
                document.getElementById("minreceivesymbol").textContent = outputSelect.value;
                updateMinimum(inputSelect.value);
            });
        }

        // Reverse button
        const reverseBtn = document.getElementById("reverse");
        if (reverseBtn) {
            reverseBtn.addEventListener("click", () => {
                SwapManager.reverseSwap();
            });
        }

        // Slippage radio buttons
        const slippageRadios = document.querySelectorAll('input[name="my-radio-group"]');
        slippageRadios.forEach(radio => {
            radio.addEventListener("change", (e) => {
                const amount = parseFloat(inputQty?.value) || 0;
                const fromToken = document.getElementById("input").value;
                const toToken = document.getElementById("output").value;

                SwapManager.updateSwapCalculation(amount, fromToken, toToken, e.target.value);
            });
        });

        // "No Minimum" checkbox (ported from uswapapp) - skips slippage protection,
        // sending memo "0" so the bridge accepts whatever amount it can give back.
        const noMinimumCheck = document.getElementById("noMinimumCheck");
        if (noMinimumCheck) {
            noMinimumCheck.addEventListener("change", (e) => {
                SwapManager.setNoMinimum(e.target.checked);

                // Grey out the now-irrelevant slippage controls for clarity
                slippageRadios.forEach(radio => { radio.disabled = e.target.checked; });
                const minReceiveInfo = document.querySelector(".min-receive-info");
                if (minReceiveInfo) {
                    minReceiveInfo.classList.toggle("text-muted", e.target.checked);
                }
            });
        }

        // Theme toggle buttons
        const themeDarkBtn = document.getElementById("changeThemeDark");
        const themeLightBtn = document.getElementById("changeThemeLight");
        if (themeDarkBtn) {
            themeDarkBtn.addEventListener("click", () => setTheme("dark"));
        }
        if (themeLightBtn) {
            themeLightBtn.addEventListener("click", () => setTheme("light"));
        }

        // Swap button
        const swapBtn = document.getElementById("swap");
        if (swapBtn) {
            swapBtn.addEventListener("click", async () => {
                await SwapManager.executeSwap();
            });
        }

        // Refresh buttons
        const refreshBtn = document.getElementById("refresh");
        if (refreshBtn) {
            refreshBtn.addEventListener("click", async () => {
                await MarketManager.fetchLiquidity();
            });
        }

        const refreshHiveMarket = document.querySelector(".refreshHiveMarket");
        if (refreshHiveMarket) {
            refreshHiveMarket.addEventListener("click", async () => {
                await MarketManager.fetchHivePrice();
                await MarketManager.fetchHBDPrice();
            });
        }

        const refreshHistory = document.querySelectorAll(".refreshHistory");
        refreshHistory.forEach(btn => {
            btn.addEventListener("click", async () => {
                await BridgeHistoryManager.fetchHistory(true);
            });
        });

        // Refresh swap history button
        const refreshSwapHistory = document.getElementById("refreshSwapHistory");
        if (refreshSwapHistory) {
            refreshSwapHistory.addEventListener("click", async () => {
                await updateSwapHistory();
            });
        }

        // Username input enter key (usernameInput already declared above)
        if (usernameInput) {
            usernameInput.addEventListener("keypress", async (e) => {
                if (e.key === "Enter") {
                    const username = e.target.value.trim();
                    if (username) {
                        // Save username when loading balance via Enter key
                        localStorage.setItem('hiveUsername', username);
                        await WalletManager.loadBalance(username);
                    }
                }
            });
        }

        // Balance amount click to fill input
        const hiveBalance = document.getElementById("hive");
        const swapHiveBalance = document.getElementById("swaphive");
        
        if (hiveBalance) {
            hiveBalance.style.cursor = "pointer";
            hiveBalance.addEventListener("click", () => {
                const amount = parseFloat(hiveBalance.textContent) || 0;
                if (amount > 0) {
                    const inputSelect = document.getElementById("input");
                    const outputSelect = document.getElementById("output");
                    const inputQty = document.getElementById("inputquantity");
                    
                    if (inputSelect && outputSelect && inputQty) {
                        inputSelect.value = "HBD";
                        inputSelect.dispatchEvent(new Event('change'));
                        outputSelect.value = "SWAP.HBD";
                        outputSelect.dispatchEvent(new Event('change'));
                        inputQty.value = amount.toFixed(3);
                        inputQty.dispatchEvent(new Event('input'));
                    }
                }
            });
        }
        
        if (swapHiveBalance) {
            swapHiveBalance.style.cursor = "pointer";
            swapHiveBalance.addEventListener("click", () => {
                const amount = parseFloat(swapHiveBalance.textContent) || 0;
                if (amount > 0) {
                    const inputSelect = document.getElementById("input");
                    const outputSelect = document.getElementById("output");
                    const inputQty = document.getElementById("inputquantity");
                    
                    if (inputSelect && outputSelect && inputQty) {
                        inputSelect.value = "SWAP.HBD";
                        inputSelect.dispatchEvent(new Event('change'));
                        outputSelect.value = "HBD";
                        outputSelect.dispatchEvent(new Event('change'));
                        inputQty.value = amount.toFixed(3);
                        inputQty.dispatchEvent(new Event('input'));
                    }
                }
            });
        }

        // API panel buttons
        const popupButtonHive = document.getElementById('popup-button-hive');
        const popupButtonEngine = document.getElementById('popup-button-engine');
        const closeButtonHive = document.getElementById('close-button-hive');
        const closeButtonEngine = document.getElementById('close-button-engine');
        
        if (popupButtonHive) {
            popupButtonHive.onclick = () => {
                toggleAPIPanel('hive', true);
            };
        }
        
        if (popupButtonEngine) {
            popupButtonEngine.onclick = () => {
                toggleAPIPanel('engine', true);
            };
        }
        
        if (closeButtonHive) {
            closeButtonHive.onclick = () => {
                toggleAPIPanel('hive', false);
            };
        }
        
        if (closeButtonEngine) {
            closeButtonEngine.onclick = () => {
                toggleAPIPanel('engine', false);
            };
        }
    }

    /**
     * Initialize UI
     */
    function initialize() {
        initializeCustomSelects();
        setupEventListeners();
        initializeTheme();
        updateVersions();

        // Set initial values
        const inputSelect = document.getElementById("input");
        updateMinimum(inputSelect ? inputSelect.value : "HBD");
        
        // Disable swap button by default until validation passes
        disableSwapButton();
        
        console.log("UI Manager initialized");
    }

    // Public API
    return {
        initialize,
        showLoading,
        hideLoading,
        showError,
        showSuccess,
        showPopupError,
        hidePopupError,
        updateBalance,
        updatePrice,
        updateLiquidity,
        updateSwapDisplay,
        clearSwapInputs,
        enableSwapButton,
        disableSwapButton,
        updateSwapHistory,
        updateBridgeHistory,
        updateVersions,
        setSwapBlocked,
        setTheme
    };
})();
