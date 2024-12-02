let DECIMAL = parseInt(1000) || 0.0;

let BASE_FEE = 0.002;
let MIN_BASE_FEE = 0.00075;
let DIFF_COEFFICIENT = 0.00575;
let BASE_PRICE_HBD_TO_SHBD = 1.00;
var HIVEPOOL = 950;
var SHIVEPOOL = 950;
const BRIDGE_USER = "uswap";
let ssc;

let COINGECKO_HIVE_URL = "https://api.coingecko.com/api/v3/simple/price?ids=hive&vs_currencies=usd";
let COINGECKO_HBD_URL = "https://api.coingecko.com/api/v3/simple/price?ids=hive_dollar&vs_currencies=usd";

let USWAPFEEJSON = "https://fee.uswap.app/hbd.json";

$(window).bind("load", async function  () {

    let uswapData = await getUswapFeeInfo();
    BASE_FEE = parseFloat(uswapData.BASE_FEE) || 0.0;
    MIN_BASE_FEE = parseFloat(uswapData.MIN_BASE_FEE) || 0.0;
    DIFF_COEFFICIENT = parseFloat(uswapData.DIFF_COEFFICIENT) || 0.0;
    BASE_PRICE_HBD_TO_SHBD = parseFloat(uswapData.BASE_PRICE_HBD_TO_SHBD) || 0.0;

    console.log("==================== FEE INFO ====================");
    console.log("BASE_FEE : ", BASE_FEE);
    console.log("MIN_BASE_FEE : ", MIN_BASE_FEE);
    console.log("DIFF_COEFFICIENT : ", DIFF_COEFFICIENT);
    console.log("BASE_PRICE_HBD_TO_SHBD : ", BASE_PRICE_HBD_TO_SHBD);
    console.log("==================================================");

    var rpc_nodes = [
        "https://api.deathwing.me",
		"https://hive.roelandp.nl",
		"https://api.openhive.network",
		"https://rpc.ausbit.dev",
		"https://hived.emre.sh",
		"https://hive-api.arcange.eu",
		"https://api.hive.blog",
		"https://api.c0ff33a.uk",
		"https://rpc.ecency.com",
		"https://anyx.io",
		"https://techcoderx.com",
		"https://api.hive.blue",
		"https://rpc.mahdiyari.info"
    ];

    var he_rpc_nodes = [
        "https://api.primersion.com",	
		"https://api2.hive-engine.com/rpc",	
		"https://engine.rishipanthee.com/",
		"https://engine.beeswap.tools",				
		"https://ha.herpc.dtools.dev/",			 
		"https://api.hive-engine.com/rpc",
		"https://herpc.actifit.io",
		"https://herpc.dtools.dev"
    ];    
    
    async function checkHiveNodeStatus(nodeUrl, statusElement) {
        try 
        {
            const response = await axios.get(nodeUrl);
            if (response.status === 200) 
            {
                statusElement.textContent = "Working";
                statusElement.classList.remove("fail"); // Remove "fail" class if present
                statusElement.classList.add("working");
            } 
            else 
            {
                statusElement.textContent = "Fail";
                statusElement.classList.remove("working"); // Remove "working" class if present
                statusElement.classList.add("fail");
            }
        } 
        catch (error) 
        {
          statusElement.textContent = "Fail";
          statusElement.classList.remove("working"); // Remove "working" class if present
          statusElement.classList.add("fail");
        }
    };
      
    async function addHiveNodes() {
        try 
        {
            var buttonHive = document.getElementById("popup-button-hive");
            var popupHive = document.getElementById("popup-container-hive");
            const tableBody = document.querySelector("#api-list-hive tbody");
            const workingNodes = [];
            const failedNodes = [];            

            // Function to enable the button
            function enableButton() 
            {
                buttonHive.disabled = false;
            }

            // Clear the existing table body content
            tableBody.innerHTML = "";
    
            for (let i = 0; i < rpc_nodes.length; i++) 
            {
                const nodeUrl = rpc_nodes[i];
                const row = document.createElement("tr");
                const urlCell = document.createElement("td");
                const statusCell = document.createElement("td");
    
                urlCell.textContent = nodeUrl;
                urlCell.classList.add("node-url"); // add new class to url cell
                statusCell.textContent = "Checking...";
    
                row.appendChild(urlCell);
                row.appendChild(statusCell);
    
                tableBody.appendChild(row);
    
                // Check node status
                checkHiveNodeStatus(nodeUrl, statusCell);
            }
    
            // Reorder the list of nodes based on their status
            setTimeout(() => {
                const rows = Array.from(tableBody.getElementsByTagName("tr"));
    
                rows.forEach((row) => {
                    if (row.lastChild.textContent === "Working") 
                    {
                        workingNodes.push(row);
                    } 
                    else 
                    {
                        failedNodes.push(row);
                    }
                });
    
                tableBody.innerHTML = "";
    
                // Append workingNodes first, then failedNodes
                workingNodes.forEach((row) => {
                    tableBody.appendChild(row);
                });
    
                failedNodes.forEach((row) => {
                    tableBody.appendChild(row);
                });
            }, 5000);
    
            // Add event listeners to the rows in the table body
            var rowsHive = tableBody.getElementsByTagName("tr");
            for (var i = 0; i < rowsHive.length; i++) 
            {
                rowsHive[i].addEventListener("click", function (event) {
                    // Prevent the default link behavior
                    event.preventDefault();
    
                    // Get the node URL from the first cell in the row
                    var nodeUrl = this.cells[0].textContent;
    
                    // Set the API endpoint to the selected node
                    hive.api.setOptions({ url: nodeUrl });
    
                    // Update the button text
                    buttonHive.value = nodeUrl;
                    buttonHive.innerHTML = nodeUrl;
    
                    // Save the selected endpoint to local storage
                    localStorage.setItem("selectedEndpoint", nodeUrl);
    
                    // Hide the popup
                    popupHive.style.display = "none";
                    
                    enableButton();
    
                    // Reload the page after 1 second (adjust the time as needed)
                    setTimeout(function () {
                        location.reload();
                    }, 1000);
                });
            }
        } 
        catch (error) 
        {
            console.log("Error at addHiveNodes(): ", error);
        }
    };       

    async function checkEngineNodeStatus(nodeUrl, statusElement) {
        try 
        {
            const response = await axios.get(nodeUrl);
            if (response.status === 200) 
            {
                statusElement.textContent = "Working";
                statusElement.classList.remove("fail"); // Remove "fail" class if present
                statusElement.classList.add("working");
            } 
            else 
            {
                statusElement.textContent = "Fail";
                statusElement.classList.remove("working"); // Remove "working" class if present
                statusElement.classList.add("fail");
            }
        } 
        catch (error) 
        {
          statusElement.textContent = "Fail";
          statusElement.classList.remove("working"); // Remove "working" class if present
          statusElement.classList.add("fail");
        }
    };

    async function addEngineNodes() {
        try {
            var buttonEngine = document.getElementById("popup-button-engine");
            var popupEngine = document.getElementById("popup-container-engine");
            const tableBody = document.querySelector("#api-list-engine tbody");
            const workingNodes = [];
            const failedNodes = [];
    
            // Function to enable the button
            function enableButton() {
                buttonEngine.disabled = false;
            }
    
            // Clear the existing table body content
            tableBody.innerHTML = "";
    
            for (let i = 0; i < he_rpc_nodes.length; i++) 
            {
                const nodeUrl = he_rpc_nodes[i];
                const row = document.createElement("tr");
                const urlCell = document.createElement("td");
                const statusCell = document.createElement("td");
    
                urlCell.textContent = nodeUrl;
                urlCell.classList.add("node-url"); // add new class to url cell
                statusCell.textContent = "Checking...";
    
                row.appendChild(urlCell);
                row.appendChild(statusCell);
    
                tableBody.appendChild(row);
    
                // Check node status
                checkEngineNodeStatus(nodeUrl, statusCell);
            }
    
            // Reorder the list of nodes based on their status
            setTimeout(() => {
                const rows = Array.from(tableBody.getElementsByTagName("tr"));
    
                rows.forEach((row) => {
                    if (row.lastChild.textContent === "Working") {
                        workingNodes.push(row);
                    } else {
                        failedNodes.push(row);
                    }
                });
    
                tableBody.innerHTML = "";
    
                // Append workingNodes first, then failedNodes
                workingNodes.forEach((row) => {
                    tableBody.appendChild(row);
                });
    
                failedNodes.forEach((row) => {
                    tableBody.appendChild(row);
                });
            }, 5000);
    
            // Add event listeners to the rows in the table body
            var rowsEngine = tableBody.getElementsByTagName("tr");
            for (var i = 0; i < rowsEngine.length; i++) 
            {
                rowsEngine[i].addEventListener("click", function (event) {
                    // Prevent the default link behavior
                    event.preventDefault();
    
                    // Get the node URL from the first cell in the row
                    var nodeUrl = this.cells[0].textContent;
    
                    // Set the API endpoint to the selected node
                    ssc = new SSC(nodeUrl);
    
                    // Update the button text
                    buttonEngine.value = nodeUrl;
                    buttonEngine.innerHTML = nodeUrl;
    
                    // Save the selected endpoint to local storage
                    localStorage.setItem("selectedEngEndpoint", nodeUrl);
    
                    // Hide the popup
                    popupEngine.style.display = "none";
    
                    enableButton();
    
                    // Reload the page after 1 second (adjust the time as needed)
                    setTimeout(function () {
                        location.reload();
                    }, 1000);
                });
            }
        } 
        catch (error) 
        {
            console.log("Error at addEngineNodes(): ", error);
        }
    };      
    
    async function initializeHiveAPI() {
        var selectedEndpoint = await getSelectedEndpoint();
        console.log("SELECT HIVE API NODE : ", selectedEndpoint);
        hive.api.setOptions({ url: selectedEndpoint });

        var button = document.getElementById("popup-button-hive");
        button.value = selectedEndpoint;
        button.innerHTML = selectedEndpoint;
    }

    async function initializeEngineAPI() {
        var selectedEngEndpoint = await getSelectedEngEndpoint();
        console.log("SELECT ENGINE API NODE : ", selectedEngEndpoint);
        ssc = new SSC(selectedEngEndpoint);

        var button = document.getElementById("popup-button-engine");
        button.value = selectedEngEndpoint;
        button.innerHTML = selectedEngEndpoint;
    }

    async function processAPIs() {
        try 
        {              
            await initializeHiveAPI();
            await initializeEngineAPI();            
        } 
        catch (error) 
        {
            console.log("Error while processing APIs: ", error);
        }
    };
      
    processAPIs();  
    
    hive.config.set('alternative_api_endpoints', rpc_nodes);

    window.history.replaceState({}, document.title, "/" + "");    

    var user = null, bal = { HBD: 0, "SWAP.HBD": 0 }, bridgebal;

    function dec(val) {
        return Math.floor(val * 1000) / 1000;
    };

    $(document).ready(function() { 
        var css1 = document.querySelector("link[href='css/main-dark.css']");
        var css2 = document.querySelector("link[href='css/main-light.css']");
        
        // Check local storage for saved theme
        if (localStorage.getItem("theme") === "light") {
          css1.disabled = true;
          css2.disabled = false;
        } else {
          css1.disabled = false;
          css2.disabled = true;
        }
        
        $("#logo").show();
        
        $("#changeThemeDark").click(function() {
          css1.disabled = false;
          css2.disabled = true;
          localStorage.setItem("theme", "dark"); // Save selected theme to local storage
          $("body").fadeOut(400, function() {
            $("body").fadeIn(400);
          });
        });
      
        $("#changeThemeLight").click(function() {
          css1.disabled = true;
          css2.disabled = false;
          localStorage.setItem("theme", "light"); // Save selected theme to local storage
          $("body").fadeOut(400, function() {
            $("body").fadeIn(400);
          });
        });

        loadHiveNode();
        loadEngineNode();               
    });

    async function loadHiveNode() {
        try 
        {
            // Get a reference to the button and the popup container
            var buttonHive = document.getElementById("popup-button-hive");
            var popupHive = document.getElementById("popup-container-hive");          
    
            // Store the interval ID
            var addHiveNodesInterval;

            // Function to disable the button
            function disableButton() {
                buttonHive.disabled = true;
            }

            // Function to enable the button
            function enableButton() {
                buttonHive.disabled = false;
            }
    
            // Add an event listener to the button
            buttonHive.addEventListener("click", function () {
                // Show the popup
                popupHive.style.display = "block";
                disableButton();
                addHiveNodes();
                addHiveNodesInterval = setInterval(addHiveNodes, 60000);
            });
    
            // Get a reference to the API list table body
            var tableBodyHive = document.querySelector("#api-list-hive tbody");
    
            // Add an event listener to the close button
            var closeButtonHive = document.getElementById("close-button-hive");
            closeButtonHive.addEventListener("click", function () {
                // Hide the popup
                popupHive.style.display = "none";
                enableButton();
    
                // Clear the interval if it exists
                if (addHiveNodesInterval) 
                {
                    clearInterval(addHiveNodesInterval);
                }
    
                // Remove all rows from the table body
                tableBodyHive.innerHTML = "";
            });
    
            // Add an event listener to the table body
            tableBodyHive.addEventListener("click", function (event) {
                var target = event.target;
                if (target && target.nodeName === "TD") 
                {
                    // Get the node URL from the first cell in the row
                    var nodeUrl = target.parentNode.cells[0].textContent;
    
                    // Set the API endpoint to the selected node
                    hive.api.setOptions({ url: nodeUrl });
    
                    // Update the button text
                    buttonHive.value = nodeUrl;
                    buttonHive.innerHTML = nodeUrl;
    
                    // Save the selected endpoint to local storage
                    localStorage.setItem("selectedEndpoint", nodeUrl);
    
                    // Hide the popup
                    popupHive.style.display = "none";
                    enableButton();
    
                    // Remove all rows from the table body
                    tableBodyHive.innerHTML = "";
    
                    // Reload the page after 1 second (adjust the time as needed)
                    setTimeout(function () {
                        location.reload();
                    }, 1000);
                }
            });

            // Add an event listener to check if the popup is still open after 1 minute
            popupHive.addEventListener("transitionend", function () {
                if (popupHive.style.display === "block") 
                {
                    // Clear the interval if it exists
                    if (addHiveNodesInterval) {
                        clearInterval(addHiveNodesInterval);
                    }

                    // Update the current set of APIs
                    addHiveNodes();
                    addHiveNodesInterval = setInterval(addHiveNodes, 60000);
                }
            });
        } 
        catch (error) 
        {
            console.log("Error at loadHiveNode(): ", error);
        }
    };
    
    async function loadEngineNode() {
        try 
        {
            // Get a reference to the button and the popup container
            var buttonEngine = document.getElementById("popup-button-engine");
            var popupEngine = document.getElementById("popup-container-engine");

            // Store the interval ID
            var addEngineNodesInterval;

            // Function to disable the button
            function disableButton() 
            {
                buttonEngine.disabled = true;
            }

            // Function to enable the button
            function enableButton() 
            {
                buttonEngine.disabled = false;
            }

            // Add an event listener to the button
            buttonEngine.addEventListener("click", function () {
                // Show the popup
                popupEngine.style.display = "block";
                disableButton();
                addEngineNodes();
                addEngineNodesInterval = setInterval(addEngineNodes, 60000);
            });

            // Get a reference to the API list table body
            var tableBodyEngine = document.querySelector("#api-list-engine tbody");

            // Add an event listener to the close button
            var closeButtonEngine = document.getElementById("close-button-engine");
            closeButtonEngine.addEventListener("click", function () {
                // Hide the popup
                popupEngine.style.display = "none";
                enableButton();

                // Clear the interval if it exists
                if (addEngineNodesInterval) 
                {
                    clearInterval(addEngineNodesInterval);
                }

                // Remove all rows from the table body
                tableBodyEngine.innerHTML = "";
            });

            // Add an event listener to the table body
            tableBodyEngine.addEventListener("click", function (event) {
                var target = event.target;
                if (target && target.nodeName === "TD") 
                {
                    // Get the node URL from the first cell in the row
                    var nodeUrl = target.parentNode.cells[0].textContent;

                    // Set the API endpoint to the selected node
                    ssc = new SSC(nodeUrl);

                    // Update the button text
                    buttonEngine.value = nodeUrl;
                    buttonEngine.innerHTML = nodeUrl;

                    // Save the selected endpoint to local storage
                    localStorage.setItem("selectedEngEndpoint", nodeUrl);

                    // Hide the popup
                    popupEngine.style.display = "none";
                    enableButton();

                    // Remove all rows from the table body
                    tableBodyEngine.innerHTML = "";

                    // Reload the page after 1 second (adjust the time as needed)
                    setTimeout(function () {
                        location.reload();
                    }, 1000);
                }
            });

            // Add an event listener to check if the popup is still open after 1 minute
            popupEngine.addEventListener("transitionend", function () {
                if (popupEngine.style.display === "block") 
                {
                    // Clear the interval if it exists
                    if (addEngineNodesInterval) {
                        clearInterval(addEngineNodesInterval);
                    }

                    // Update the current set of APIs
                    addEngineNodes();
                    addEngineNodesInterval = setInterval(addEngineNodes, 60000);
                }
            });
        } 
        catch (error) 
        {
            console.log("Error at loadEngineNode(): ", error);
        }
    };  

    async function getBalances(account) {
        try
        {
            const res = await hive.api.getAccountsAsync([account]);
            if (res.length > 0) 
            {
                const res2 = await ssc.find("tokens", "balances", { account, symbol: { "$in": ["SWAP.HBD"] } }, 1000, 0, []);
                var swaphive = res2.find(el => el.symbol === "SWAP.HBD");
                return {
                    HBD: dec(parseFloat(res[0].balance.split(" ")[0])),
                    "SWAP.HBD": dec(parseFloat((swaphive) ? swaphive.balance : 0))
                }

            } 
            else 
            {
                return { HBD: 0, "SWAP.HBD": 0 };
            }   
        }
        catch (error)
        {
            console.log("Error at getBalances() : ", error);
        }
    };

    async function getExtBridge () {
        try
        {
            const res = await hive.api.getAccountsAsync(['uswap']);
            var hiveLiq = res[0].balance.split(" ")[0];
            hiveLiq = Math.floor(hiveLiq * DECIMAL) / DECIMAL;

            const res2 = await ssc.findOne("tokens", "balances", { account: 'uswap', symbol: 'SWAP.HBD' });
            var swaphiveLiq = parseFloat(res2.balance) || 0.0;
            swaphiveLiq = Math.floor(swaphiveLiq * DECIMAL) / DECIMAL;

            $("#hive_liq").text(hiveLiq);
            $("#swap_liq").text(swaphiveLiq);
            $("#bridge").removeClass("d-none");
        }
        catch (error)
        {
            console.log("Error at getExtBridge() : ", error);
        }
    };   

    async function refresh() {
        try
        {
            updateMin();
            bridgebal = await getBalances("uswap");
            $("#hiveliquidity").text(bridgebal.HIVE.toFixed(3));
            $("#swaphiveliquidity").text(bridgebal["SWAP.HBD"].toFixed(3));
            console.log("");
            console.log(
                'Update HBD Liquidity: ' + bridgebal.HIVE.toFixed(3) + ' HBD',
            );

            console.log(
                'Update SWAP.HBD Liquidity: ' + bridgebal["SWAP.HBD"].toFixed(3) + ' SWAP.HBD',
            );        

            try 
            {
                if (hive_keychain) 
                {
                    $("#txtype").removeAttr("disabled");
                    $("#txtype").attr("checked", true);
                }
            }
            catch (e) 
            {
                $("#txtype").attr("disabled", true);
                $("#txtype").removeAttr("checked");
            }
            $("input[name=txtype]").change();
        }
        catch (error)
        {
            console.log("Error at refresh() : ", error);
        }
    };

    $("#refresh").click(async function () {
        $(this).attr("disabled", true);
        await refresh();
        $(this).removeAttr("disabled");
    });

    function updateMin() {
        const insymbol = $("#input").val();
        $("#minimum").text(`1 ${insymbol}`);
    }

    async function updateSwap(r) {
        try 
        {
            updateMin();
            const insymbol = $("#input").val();
            var outsymbol = $("#output").val();
            const val = $("#inputquantity").val();
            var inputVal = parseFloat(val) || 0.0;

            var hBalance = await calcHiveAmount();
            var shBalance = await calcSwapHiveAmount();

            if(hBalance > 0)
            {
                HIVEPOOL = hBalance;
            }
            if(shBalance > 0)
            {
                SHIVEPOOL = shBalance;
            }
            
            var expResult = 0.0;
            if(insymbol == "HBD")
            {
                var diff = ((inputVal * 0.5 + HIVEPOOL) / (SHIVEPOOL + HIVEPOOL)) - 0.5;
                var adjusted_base_fee = Math.max( BASE_FEE * (1 - 2 * Math.abs(diff)), MIN_BASE_FEE );
                var price = BASE_PRICE_HBD_TO_SHBD - (2 * diff * DIFF_COEFFICIENT);
                expResult = (inputVal * price) * (1 - adjusted_base_fee);
                expResult = Math.floor(expResult * DECIMAL) / DECIMAL;                
            }
            if(insymbol == "SWAP.HBD")
            {
                var diff = ((inputVal * 0.5 + SHIVEPOOL) / (SHIVEPOOL + HIVEPOOL)) - 0.5;
                var adjusted_base_fee = Math.max( BASE_FEE * (1 - 2 * Math.abs(diff)), MIN_BASE_FEE );
                var price = 1 / BASE_PRICE_HBD_TO_SHBD - (2 * diff * DIFF_COEFFICIENT);
                expResult = (inputVal * price) * (1 - adjusted_base_fee);
                expResult = Math.floor(expResult * DECIMAL) / DECIMAL;
            }

            const output = expResult;

            var outVal = $("#outputquantity").val();
            var outputVal = parseFloat(outVal) || 0.0;
            if(outputVal != expResult)
            {
                expResult = outputVal;
            }

            if (insymbol === outsymbol) {
                var othersymbol;

                $("#output option").each(function () {
                    if ($(this).val() !== insymbol) {
                        othersymbol = $(this).val();
                        return
                    }
                });

                outsymbol = othersymbol;
                $("#output").val(othersymbol);
            }

            const slipageQty = document.getElementById('slipageqty').textContent;
            var minExpectVal = parseFloat(slipageQty) || 0.0;
            if(minExpectVal > 0.0)
            {
                if (bridgebal[outsymbol] >= output
                    && bal[insymbol] >= val
                    && insymbol !== outsymbol
                    && val >= 1) {
                    $("#swap").removeAttr("disabled");
                    if (r) r(true, parseFloat(val).toFixed(3), insymbol, minExpectVal.toFixed(3));
                } 
                else {
                    $("#swap").attr("disabled", "true");
                    if (r) r(false);
                }
            }
        } 
        catch (error) 
        { 
            console.log("Error at updateSwap() : ", error); 
        }
    }

    var modal = new bootstrap.Modal(document.getElementById('authqr'), {
        focus: true,
        backdrop: 'static',
    });

    async function setOutPut() {
        try
        {
            const insymbol = $("#input").val();
            var outsymbol = $("#output").val();
            const val = $("#inputquantity").val();
            var inputVal = parseFloat(val) || 0.0;
            var expResult = 0.0;

            const slipageQty = document.getElementById('slipageqty');
            const selectedRadioElement = document.querySelector('input[name="my-radio-group"]:checked');
            const selectedRadioVal = selectedRadioElement ? parseFloat(selectedRadioElement.value) : 0;

            if(inputVal > 0.0)
            {
                var hBalance = await calcHiveAmount();
                var shBalance = await calcSwapHiveAmount();
                if(hBalance > 0)
                {
                    HIVEPOOL = hBalance;
                }
                if(shBalance > 0)
                {
                    SHIVEPOOL = shBalance;
                }               
                
                if(insymbol == "HBD")
                {
                    var diff = ((inputVal * 0.5 + HIVEPOOL) / (SHIVEPOOL + HIVEPOOL)) - 0.5;
                    var adjusted_base_fee = Math.max( BASE_FEE * (1 - 2 * Math.abs(diff)), MIN_BASE_FEE );
                    var price = BASE_PRICE_HBD_TO_SHBD - (2 * diff * DIFF_COEFFICIENT);
                    expResult = (inputVal * price) * (1 - adjusted_base_fee);
                    expResult = Math.floor(expResult * DECIMAL) / DECIMAL;
                }
                if(insymbol == "SWAP.HBD")
                {
                    var diff = ((inputVal * 0.5 + SHIVEPOOL) / (SHIVEPOOL + HIVEPOOL)) - 0.5;
                    var adjusted_base_fee = Math.max( BASE_FEE * (1 - 2 * Math.abs(diff)), MIN_BASE_FEE );
                    var price = 1 / BASE_PRICE_HBD_TO_SHBD - (2 * diff * DIFF_COEFFICIENT);
                    expResult = (inputVal * price) * (1 - adjusted_base_fee);
                    expResult = Math.floor(expResult * DECIMAL) / DECIMAL; 
                }

                $("#outputquantity").val(expResult.toFixed(3));                
                slipageQty.textContent = Math.floor((expResult * (1 - (selectedRadioVal / 100))) * DECIMAL) / DECIMAL;
                await expectedFeeCalc(inputVal, expResult); 
            }
            else
            {
                $("#outputquantity").val(expResult.toFixed(3));
                var expFee = 0.0;
                $("#expectedfee").text(expFee.toFixed(3));
                $("#expectedper").text(expFee.toFixed(3));
                slipageQty.textContent = Math.floor((expResult * (1 - (selectedRadioVal / 100))) * DECIMAL) / DECIMAL;
                slipageQty.textContent = expResult.toFixed(3);
            }
        }
        catch (error)
        {
            console.log("setOutPut Error : ", error);
            $("#outputquantity").val();
        }
    }

    async function expectedFeeCalc(inputVal, expResult) 
    {
        try
        {
            var expFee = Math.ceil((inputVal - expResult) * DECIMAL) / DECIMAL;
            $("#expectedfee").text(expFee);
            await expectedFeePercentage(inputVal, expFee);
        }
        catch (error)
        {
            console.log("expectedFeeCalc Error : ", error);
        }
    }

    async function expectedFeePercentage(inputVal, feeVal)
    {
        try
        {
            var expFee = Math.ceil((feeVal / inputVal * 100) * DECIMAL) / DECIMAL;
            $("#expectedper").text(expFee);
        }
        catch (error)
        {
            console.log("expectedFeePercentage Error : ", error);
        }
    }

    $(".s").click(function () {
        $("#input").val($(this).find(".sym").text());
        $("#inputquantity").val($(this).find(".qt").text());
        setOutPut();
        updateSwap();
    });

    /*
    let debounceTimeoutKeyup;
    
    $("#inputquantity").keyup(() => {
        clearTimeout(debounceTimeoutKeyup);
        debounceTimeoutKeyup = setTimeout(() => {  
            console.log("HERE UP");           
            updateSwap();
            setOutPut();
        }, 500); // Adjust the delay duration (in milliseconds) as needed
    });
    */

    let debounceTimeoutInput;
    let latestInputValue = null;

    $("#inputquantity").on("input", () => {
        clearTimeout(debounceTimeoutInput);
        debounceTimeoutInput = setTimeout(() => {                    
            updateSwap();
            setOutPut();
            if (latestInputValue !== null) 
            {
                updateSlipageQtyClick(latestInputValue);
                updateOptionValuesClick(latestInputValue);
            }
        }, 500); // Adjust the delay duration (in milliseconds) as needed
    });

    $("#hive").click(async () => {   
        latestInputValue = "HBD";     
        await updateInputClick("HBD");
    });

    $("#swaphive").click(async () => { 
        latestInputValue = "SWAP.HBD";       
        await updateInputClick("SWAP.HBD");
    });

    async function updateInputClick(selectedValue) {
        try 
        {
            const input = document.getElementById('inputquantity');
            const inputElement = document.getElementById("input");
            const feetickerElement = document.getElementById("minreceivesymbol");
            inputElement.value = selectedValue;
            feetickerElement.textContent = selectedValue === "HBD" ? "SWAP.HBD" : "HBD"; 
            var inputVal = parseFloat(input.value) || 0;
    
            latestInputValue = selectedValue;
    
            await updateSlipageQtyClick(inputVal);
            await updateOptionValuesClick(selectedValue); 
        } 
        catch (error) 
        {
            console.log("Error at updateInputClick(): ", error);
        }            
    };
    
    async function updateSlipageQtyClick(inputVal) {
        try 
        {
            const output = document.getElementById('outputquantity');
            const slipageQty = document.getElementById('slipageqty');
            const selectedRadioElement = document.querySelector('input[name="my-radio-group"]:checked');
            const selectedRadioVal = selectedRadioElement ? parseFloat(selectedRadioElement.value) : 0;
            const selectedSymbol = latestInputValue; // Use the latest input value        
            let calcOut = await calcOutput(inputVal, selectedSymbol);
            output.value = Math.floor((calcOut) * DECIMAL) / DECIMAL;
    
            if (selectedRadioElement) {
                calcOut *= (1 - (selectedRadioVal / 100));
            }                           
            slipageQty.textContent = Math.floor((calcOut) * DECIMAL) / DECIMAL;
        } 
        catch (error) 
        {
            console.log("Error at updateSlipageQtyClick(): ", error);
        }
    };
    
    async function updateOptionValuesClick(inputSymbol) { 
        try 
        {                      
            const outputElement = document.getElementById("output");
            if (inputSymbol === 'HBD') {
                outputElement.value = 'SWAP.HBD';
            } else if (inputSymbol === 'SWAP.HBD') {
                outputElement.value = 'HBD';
            }
        } 
        catch (error) 
        {
            console.log("Error at updateOptionValuesClick(): ", error);
        }
    };   

    $("#input, #output").change(() => { updateSwap(); setOutPut(); });

    $("#reverse").click(function () {
        //var input = $("#input").val();
        //$("#input").val($("#output").val());
        //$("#output").val(input);
        updateSwap();
    });

    async function updateBalance() {
        bal = await getBalances(user);
        console.log("");
        console.log(
            `Update HBD Balance: @${user} ` + bal.HBD.toFixed(3) + ' HBD',
        );

        console.log(
            `Update SWAP.HBD Balance: @${user} ` + bal["SWAP.HBD"].toFixed(3) + ' SWAP.HBD',
        );

        $("#hive").text(bal.HBD.toFixed(3));
        $("#swaphive").text(bal["SWAP.HBD"].toFixed(3));
        var baseFee = BASE_FEE * 100;
        //$("#basefeedisplay").text(baseFee);        
    }

    $("#checkbalance").click(async function () {
        user = $.trim($("#username").val().toLowerCase());

        if (user.length >= 3) {
            $(this).attr("disabled", "true");
            await updateBalance();
            updateSwap();
            $(this).removeAttr("disabled");
            localStorage['user'] = user;
        }
    });

    if (localStorage['user']) {
        $("#username").val(localStorage['user']);
        user = localStorage['user'];
        updateBalance();
    }

    // HAS implementation
    const HAS_SERVER = "wss://hive-auth.arcange.eu";
    const HAS_APP_DATA = {
        name: "UPMESWAP",
        description: "Discounted Bridge",
        icon: "https://uswap.app/assets/hiveupme.png",
    };

    const app_key = uuidv4();

    var token
    var expire
    var auth_key
    var ws = undefined;

    if ("WebSocket" in window) {
        $("#txtype1").removeAttr("disabled");

        if ($("#txtype").attr("checked") !== "true") {
            $("#txtype").removeAttr("checked");
            $("#txtype1").attr("checked", true);
        }

        $("input[name=txtype]").change();

        ws = new WebSocket(HAS_SERVER)

        ws.onopen = function () {
            console.log("Connection Established");
            // Web Socket is connected
        }
    } 
    else {
        $("#txtype1").attr("disabled", true);
        $("#txtype1").removeAttr("checked");
    }

    function isTimeAvailable(ex) {
        const timestamp = new Date().getTime();
        if (ex > timestamp)
            return true;
        else
            return false;
    }    

    $("#swap").click(async function () {
        $("#swap").attr("disabled", "true");
        $("#loading").removeClass("d-none");
        $("#status").text("Please Wait...");
        await refresh();
        await updateBalance();
        var memoMsg = $("#slipageqty").val();
        console.log("memoMsg : ", memoMsg);

        updateSwap(function (canSwap, amount, currency, memoMsg) {
            if (canSwap) {                
                const txtype = $("input[type='radio'][name='txtype']:checked").val();
                $("#swap").attr("disabled", "true");
                $("#loading").addClass("d-none");
                $("#status").text(`Confirm the transaction through ${txtype}.`);

                if (txtype === "Hive Keychain") {
                    if (currency !== "HBD") {
                        hive_keychain.requestSendToken(
                            user,
                            "uswap",
                            amount,
                            memoMsg,
                            currency,
                            async function (res) {
                                if (res.success === true) {
                                    $("#status").text("Swapping Done Successfully!");
                                    $("#status").addClass("text-success");
                                    await updateBalance();
                                    //updateSwap();

                                    //Added Here
                                    await setSwapAmounts();
                                } 
                                else {
                                    $("#status").text("Transaction failed, Please try again.");
                                    //updateSwap();
                                }

                                console.log(res);
                            }
                        );
                    } 
                    else {
                        hive_keychain.requestTransfer(
                            user,
                            "uswap",
                            amount,
                            memoMsg,
                            currency,
                            async function (res) {
                                if (res.success === true) {
                                    $("#status").text("Swapping Done Successfully!");
                                    $("#status").addClass("text-success");
                                    await updateBalance();
                                    //updateSwap();

                                    //Added Here
                                    await setSwapAmounts();
                                } 
                                else {
                                    $("#status").text("Transaction failed, Please try again.");
                                    //updateSwap();
                                }

                                console.log(res);
                            }
                        );
                    }
                } 
                else if (txtype === "Hive Auth") {
                    ws.onmessage = function (event) {
                        const message = typeof (event.data) == "string" ? JSON.parse(event.data) : event.data;

                        if (message.cmd) {
                            switch (message.cmd) {
                                case "auth_wait":
                                    // Update QRCode
                                    const json = JSON.stringify({
                                        account: user,
                                        uuid: message.uuid,
                                        key: auth_key,
                                        host: HAS_SERVER
                                    });

                                    const URI = `has://auth_req/${btoa(json)}`
                                    var url = "https://api.qrserver.com/v1/create-qr-code/?size=1000x1000&data=" + URI;
                                    $("#qr-code").attr("src", url);
                                    $("#qr-link").attr("href", URI);

                                    $("#qr-div").addClass("d-flex");
                                    $("#qr-div").removeClass("d-none");
                                    $("#approve-div").addClass("d-none");
                                    $("#approve-div").removeClass("d-flex");

                                    modal.show();
                                    break;

                                    case "auth_ack":
                                    try {
                                        // Try to decrypt and parse payload data
                                        message.data = JSON.parse(CryptoJS.AES.decrypt(message.data, auth_key).toString(CryptoJS.enc.Utf8))
                                        token = message.data.token
                                        expire = message.data.expire
                                        localStorage['token'] = token;
                                        localStorage['expire'] = expire;
                                        localStorage['auth_key'] = auth_key;

                                        $("#qr-div").removeClass("d-flex");
                                        $("#qr-div").addClass("d-none");
                                        $("#approve-div").addClass("d-flex");
                                        $("#approve-div").removeClass("d-none");

                                        modal.show();
                                        $("#approve").click(function () {
                                            modal.hide();
                                            const json = JSON.stringify({
                                                "contractName": "tokens",
                                                "contractAction": "transfer",
                                                "contractPayload": {
                                                    "symbol": currency,
                                                    "to": "uswap",
                                                    "quantity": amount,
                                                    "memo": memoMsg
                                                }
                                            });

                                            if (currency !== "HBD") {
                                                const op = [
                                                    "custom_json",
                                                    {
                                                        id: "ssc-mainnet-hive",
                                                        json: json,
                                                        required_auths: [user],
                                                        required_posting_auths: [],
                                                    }
                                                ]

                                                const sign_data = {
                                                    key_type: "active",
                                                    ops: [op],
                                                    broadcast: true
                                                };

                                                const data = CryptoJS.AES.encrypt(JSON.stringify(sign_data), auth_key).toString();
                                                const payload = { cmd: "sign_req", account: user, token: token, data: data };
                                                ws.send(JSON.stringify(payload));
                                            } 
                                            else {
                                                const op = [
                                                    "transfer",
                                                    {
                                                        from: user,
                                                        to: 'uswap',
                                                        amount: `${amount} HBD`,
                                                        memoMsg,
                                                    }
                                                ]

                                                const sign_data = {
                                                    key_type: "active",
                                                    ops: [op],
                                                    broadcast: true
                                                };

                                                const data = CryptoJS.AES.encrypt(JSON.stringify(sign_data), auth_key).toString();
                                                const payload = { cmd: "sign_req", account: user, token: token, data: data };
                                                ws.send(JSON.stringify(payload));
                                            }
                                        });
                                    } 
                                    catch (e) {
                                        // Decryption failed - ignore message
                                        modal.hide();
                                        console.error("decryption failed", e.message)
                                        $("#loading").addClass("d-none");
                                        $("#status").text("Failed to Establish connection with HAS. Try Again!");
                                        updateSwap();
                                    }
                                    break;

                                case "auth_nack":
                                    modal.hide();
                                    $("#loading").addClass("d-none");
                                    $("#status").text("Failed to Establish connection with HAS. Try Again!");
                                    updateSwap();
                                    break;

                                case "sign_wait":
                                    $("#loading").removeClass("d-none");
                                    $("#status").text("Waiting for approval from Hive Auth App.");
                                    break;

                                case "sign_ack":
                                    $("#loading").addClass("d-none");
                                    $("#status").text("Swapping Done Successfully!");
                                    $("#status").addClass("text-success");
                                    updateSwap();

                                    //Added Here
                                    setSwapAmounts();
                                    break;

                                case "sign_nack":
                                    $("#loading").addClass("d-none");
                                    $("#status").text("Transaction was declined through HiveAuth.");
                                    updateSwap();
                                    break;

                                case "sign_err":
                                    $("#loading").addClass("d-none");
                                    $("#status").text("Transaction was unsuccessfull through HiveAuth.");
                                    updateSwap();
                                    break;
                            }
                        }
                    }

                    const auth_data = {
                        app: HAS_APP_DATA,
                        token: undefined,
                        challenge: undefined
                    };

                    auth_key = uuidv4();

                    if (localStorage['token']
                        && localStorage['auth_key']
                        && isTimeAvailable(localStorage['expire'])) {

                        token = localStorage['token'];
                        auth_key = localStorage['auth_key'];
                        auth_data.token = token;
                    }

                    const data = CryptoJS.AES.encrypt(JSON.stringify(auth_data), auth_key).toString();
                    const payload = { cmd: "auth_req", account: user, data: data, token: token };
                    ws.send(JSON.stringify(payload));
                } 
                else {
                    $("#loading").addClass("d-none");
                    $("#status").text("No method of transaction available.");
                    updateSwap();
                }
            } 
            else {
                $("#loading").addClass("d-none");
                $("#status").text("Balance or Liquidity is changed, Please try again.");
            }
        });
    });

    $("input[name=txtype]").change(function () {
        const el = $("input[type='radio'][name='txtype']");
        el.each(function () {
            if ($(this).prop("checked") == true) {
                $(this).parent("div").addClass("bg-primary");
            } 
            else {
                $(this).parent("div").removeClass("bg-primary");
            }
        });
    });

    $(".refreshHistory").click(function () {
        historyReader();
    });

    $(".refreshHiveMarket").click(function () {
        getHiveMarket();
    });

    $(".refreshTokenMarket").click(function () {
        getTokenMarket();
    });

    // update every 15 seconds
    /*
    (async function autoRefresh() {
        await refresh();
        await updateBalance();
        updateSwap();
        setTimeout(autoRefresh, 15000);
    })();
    */

    function timeout(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    };

    // dont need any await here
    // function awaitFunction () 
    // {
    //     return new Promise(function (resolve, reject) {
    //         setTimeout(function () {
    //             resolve();
    //         }, 1000);
    //     });
    // };

    const intervalBalances = async function () {
        var TIMEOUT = 1000 * 10;
        try 
        {
            console.log("");
            console.warn("Here Refreshing");
            //const _await = await awaitFunction(); 
            // await timeout(TIMEOUT);   
            await refresh();
            await updateBalance();
            //updateSwap();
            //getExtBridge();
            historyReader();
            console.log("");
            console.warn("Refresh ended");
            // setting timeout for 60 secs
            setTimeout(intervalBalances, 60000);
        }
        catch (error) 
        {
            console.log("Error @ Refreshing : ", error);
            setTimeout(intervalBalances, 60000);
        }
    };

    setTimeout(intervalBalances, 60000);

    async function setSwapAmounts() {
        var TIMEOUT = 1000 * 10;
        try 
        {
            await timeout(TIMEOUT);
            console.log("Restting to Zero");
            $("#inputquantity").val("0.000");
            $("#outputquantity").val("0.000");

            const slipageQty = document.getElementById('slipageqty');
            slipageQty.textContent = "0.000";

            const radioGroup = document.getElementsByName('my-radio-group');
            radioGroup.forEach(radio => {
                radio.checked = false;
            });

            $("#expectedfee").val("0.000");
            $("#expectedfee").text("0.000");
            $("#expectedper").val("0.000");
            $("#expectedper").text("0.000");
            $("#status").text("");
            $("#status").removeClass("text-success");
            $("#swap").attr("disabled", "true");
        }
        catch (error) 
        {
            console.log("setSwapAmounts : ", error);
        }
    };

    async function changeMinOutput() {
        try 
        {
            // Get references to the input and output elements
            const input = document.getElementById('inputquantity');
            const output = document.getElementById('outputquantity');
            const radioGroup = document.getElementsByName('my-radio-group');
            const slipageQty = document.getElementById('slipageqty');
            const inputElement = document.getElementById("input");
            const outputElement = document.getElementById("output");
            const feetickerElement = document.getElementById("minreceivesymbol");
            const reverseButton = document.getElementById('reverse');
    
            const hiveSpan = document.getElementById('hive');
            const swaphiveSpan = document.getElementById('swaphive');
    
            // Function to update the input element and recalculate output and slippage quantities
            async function updateInputs(selectedValue) {
                inputElement.value = selectedValue;
                feetickerElement.textContent = selectedValue === "HBD" ? "SWAP.HBD" : "HBD";                
                await updateSlipageQty();
                await updateOptionValues();                
            }
    
            hiveSpan.addEventListener('click', async() => {                
                await updateInputs("HBD");
            });
    
            swaphiveSpan.addEventListener('click', async() => {
                await updateInputs("SWAP.HBD");
            });
    
            // Add event listeners to the input and radio group elements
            input.addEventListener('input', async() => {
                await updateSlipageQty();
            });

            // Add event listener to the output element to update slipageQty
            output.addEventListener("change", async () => {
                slipageQty.textContent = Math.floor((output.value) * DECIMAL) / DECIMAL;
            });
    
            radioGroup.forEach(radio => {
                radio.addEventListener('change', async() => {
                    await updateSlipageQty();
                });
            });
    
            // Add event listener to the input element to update feetickerElement
            inputElement.addEventListener("change", async () => {                
                await updateInputs(inputElement.value);
            });            
    
            reverseButton.addEventListener('click', async() => {
                await updateInputs(inputElement.value === "HBD" ? "SWAP.HBD" : "HBD");
            });

            async function updateOptionValues() {
                // update the output select element based on the input select value                
                if (inputElement.value === 'HBD') {
                    outputElement.value = 'SWAP.HBD';
                } else if (inputElement.value === 'SWAP.HBD') {
                    outputElement.value = 'HBD';
                }
            };
    
            async function updateSlipageQty() {
                const inputVal = parseFloat(input.value) || 0;
                const selectedRadioElement = document.querySelector('input[name="my-radio-group"]:checked');
                const selectedRadioVal = selectedRadioElement ? parseFloat(selectedRadioElement.value) : 0;
                const selectedSymbol = inputElement.value;
                
                let calcOut = await calcOutput(inputVal, selectedSymbol);
                output.value = Math.floor((calcOut) * DECIMAL) / DECIMAL;
    
                if (selectedRadioElement) {
                    calcOut *= (1 - (selectedRadioVal / 100));
                }                           
                slipageQty.textContent = Math.floor((calcOut) * DECIMAL) / DECIMAL;
            }; 
        }
        catch (error) 
        {
            console.log("changeMinOutput : ", error);
        }
    };   

    async function calcOutput(inputVal, selectedSymbol)
    {
        var calcVal = 0.000;
        try
        {                       
            inputVal = parseFloat(inputVal) || 0.0;
            var expResult = 0.000;

            if(inputVal > 0.0)
            {
                var hBalance = await calcHiveAmount();
                var shBalance = await calcSwapHiveAmount();
                if(hBalance > 0)
                {
                    HIVEPOOL = hBalance;
                }
                if(shBalance > 0)
                {
                    SHIVEPOOL = shBalance;
                }               
                
                if(selectedSymbol == "HBD")
                {
                    var diff = ((inputVal * 0.5 + HIVEPOOL) / (SHIVEPOOL + HIVEPOOL)) - 0.5;
                    var adjusted_base_fee = Math.max( BASE_FEE * (1 - 2 * Math.abs(diff)), MIN_BASE_FEE );
                    var price = BASE_PRICE_HBD_TO_SHBD - (2 * diff * DIFF_COEFFICIENT);
                    expResult = (inputVal * price) * (1 - adjusted_base_fee);
                    expResult = Math.floor(expResult * DECIMAL) / DECIMAL;
                }
                if(selectedSymbol == "SWAP.HBD")
                {
                    var diff = ((inputVal * 0.5 + SHIVEPOOL) / (SHIVEPOOL + HIVEPOOL)) - 0.5;
                    var adjusted_base_fee = Math.max( BASE_FEE * (1 - 2 * Math.abs(diff)), MIN_BASE_FEE );
                    var price = 1 / BASE_PRICE_HBD_TO_SHBD - (2 * diff * DIFF_COEFFICIENT);
                    expResult = (inputVal * price) * (1 - adjusted_base_fee);
                    expResult = Math.floor(expResult * DECIMAL) / DECIMAL; 
                }               
            }
            calcVal = expResult;
            return calcVal;
        }
        catch (error)
        {
            console.log("Error at calcOutput() : ", error);
            return calcVal;
        }
    };

    //End of refresh

    const calcHiveAmount = async () => {
        var hiveBalance = 0.0;
        try
        {
            let hiveData = await hive.api.callAsync('condenser_api.get_accounts', [[BRIDGE_USER]]);
            if(hiveData.length > 0)
            {        
                hiveBalance = parseFloat(hiveData[0].balance.replace("HBD", "").trim()) || 0.0;
            }
            return hiveBalance;
        }
        catch(error)
        {
            console.log("Error at calcHiveAmount() : ", error);
            return hiveBalance;
        }
    }
    
    const calcSwapHiveAmount = async () => {
        var swapHiveBalance = 0.0;
        try
        {
            let swapHiveData = await ssc.findOne('tokens', 'balances', {'account': BRIDGE_USER, 'symbol': 'SWAP.HBD'});
            if(swapHiveData != null)
            {        
                swapHiveBalance = parseFloat(swapHiveData.balance) || 0.0;
                swapHiveBalance = Math.floor(swapHiveBalance * DECIMAL) / DECIMAL;
                swapHiveBalance = parseFloat(swapHiveData.balance) || 0.0;            
            }
            return swapHiveBalance;
        }
        catch(error)
        {
            console.log("Error at calcSwapHiveAmount() : ", error);
            return swapHiveBalance;
        }
    }

    refresh();
    //getExtBridge();
    changeMinOutput();

    getTokenMarket();
    getHiveMarket();    
});

const historyReader = async () => {
    try {
        var historyFinal = await finalHistory();
        if (historyFinal.length > 0) {
            $("#historycard").removeClass("d-none");
            $("#historycard").addClass("d-flex");
            console.log(historyFinal);
            let tbHive = $("#historyHive");
            let tbSwapHive = $("#historySwapHive");
            tbHive.html("");
            tbSwapHive.html("");

            historyFinal.forEach((item, index) => {
                time = new Date(item.time).toLocaleString();
                let tr = $("<tr></tr>");
                tr.append(`<td><a class="history-link-info" target="_blank" href="https://peakd.com/@${item.to}">@${item.to}</a></td>`);
                tr.append(`<td>${item.amount}</td>`);
                tr.append(`<td>${item.type}</td>`);
                tr.append(`<td>${time}</td>`);
                tr.append(`<td><a class="history-link-info" target="_blank" href="${item.type === 'HBD' ? 'https://hiveblocks.com/tx/' : 'https://he.dtools.dev/tx/'}${item.trx}">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-link-45deg" viewBox="0 0 16 16">
                        <path d="M4.715 6.542 3.343 7.914a3 3 0 1 0 4.243 4.243l1.828-1.829A3 3 0 0 0 8.586 5.5L8 6.086a1.002 1.002 0 0 0-.154.199 2 2 0 0 1 .861 3.337L6.88 11.45a2 2 0 1 1-2.83-2.83l.793-.792a4.018 4.018 0 0 1-.128-1.287z"/>
                        <path d="M6.586 4.672A3 3 0 0 0 7.414 9.5l.775-.776a2 2 0 0 1-.896-3.346L9.12 3.55a2 2 0 1 1 2.83 2.83l-.793.792c.112.42.155.855.128 1.287l1.372-1.372a3 3 0 1 0-4.243-4.243L6.586 4.672z"/>
                    </svg>
                </td>`);

                if (item.type === 'HBD') {
                    tbHive.append(tr);
                } 
                else {
                    tbSwapHive.append(tr);
                }
            });
        }
    }
    catch (error) {
        console.log("Error At historyReader : ", error);
    }
};

const finalHistory = async () => {
    var finalArray = [];
    try {
        var sortData = await sortHistory();
        if (sortData.length > 0) {
            var hiveArray = [];
            var swaphiveArray = [];
            for (let i = 0; i < sortData.length; i += 1) {
                var trx = sortData[i].trx;
                var to = sortData[i].to;
                var amount = sortData[i].amount;
                var time = sortData[i].time;
                var timeStamp = sortData[i].timeStamp;
                var type = sortData[i].type;

                if (type == "HBD") {
                    var ddata = {
                        "trx": trx,
                        "to": to,
                        "amount": amount,
                        "time": time,
                        "timeStamp": timeStamp,
                        "type": type
                    };
                    hiveArray.push(ddata);
                }

                if (type == "SWAP.HBD") {
                    var ddata = {
                        "trx": trx,
                        "to": to,
                        "amount": amount,
                        "time": time,
                        "timeStamp": timeStamp,
                        "type": type
                    };
                    swaphiveArray.push(ddata);
                }
            }

            if (hiveArray.length > 0) {
                for (let i = 0; i < 3; i += 1) {
                    var ddata = {
                        "trx": hiveArray[i].trx,
                        "to": hiveArray[i].to,
                        "amount": hiveArray[i].amount,
                        "time": hiveArray[i].time,
                        "timeStamp": hiveArray[i].timeStamp,
                        "type": hiveArray[i].type
                    };
                    finalArray.push(ddata);
                }
            }

            if (swaphiveArray.length > 0) {
                for (let i = 0; i < 3; i += 1) {
                    var ddata = {
                        "trx": swaphiveArray[i].trx,
                        "to": swaphiveArray[i].to,
                        "amount": swaphiveArray[i].amount,
                        "time": swaphiveArray[i].time,
                        "timeStamp": swaphiveArray[i].timeStamp,
                        "type": swaphiveArray[i].type
                    };
                    finalArray.push(ddata);
                }
            }
        }
        return finalArray;
    }
    catch (error) {
        console.log("Error At finalHistory : ", error);
        return finalArray;
    }
};

const sortHistory = async () => {
    var sortArray = [];
    try {
        var processData = await processHistory();
        if (processData.length > 0) {
            processData.sort(function (a, b) {
                return parseFloat(b.timeStamp) - parseFloat(a.timeStamp);
            });
            sortArray = processData;
        }
        return sortArray;
    }
    catch (error) {
        console.log("Error At sortHistory : ", error);
        return sortArray;
    }
};

const processHistory = async () => {
    var historyArray = [];
    try {
        var historyData = await getHistory();
        if (historyData.length > 0) {
            for (let i = 0; i < historyData.length; i += 1) {
                var trx = historyData[i].trx;
                var to = historyData[i].to;
                var amount = historyData[i].amount;
                var time = historyData[i].time;
                var timeStamp = await setTimeStamp(time);
                var type = historyData[i].type;

                var ddata = {
                    "trx": trx,
                    "to": to,
                    "amount": amount,
                    "time": time,
                    "timeStamp": timeStamp,
                    "type": type
                };
                historyArray.push(ddata);
            }
        }
        return historyArray;
    }
    catch (error) {
        console.log("Error At processHistory : ", error);
        return historyArray;
    }
};

const getHistory = async () => {
    var trxArray = [];
    try {
        var resultData = await hive.api.getAccountHistoryAsync("uswap.hbd", -1, 50);
        if (resultData.length > 0) {
            resultData.forEach(function (tx) {
                var op = tx[1].op;
                var op_type = op[0];
                var op_value = op[1];
                var time = tx[1].timestamp;
                var trx_id = tx[1].trx_id;

                if (op_type == "transfer") {
                    if (op_value.from == "uswap.hbd" && op_value.to != "uswap.app") {
                        var trxTo = op_value.to;
                        var trxAmount = parseFloat(op_value.amount.replace("HBD", "").trim());
                        var type = "HBD";
                        var ddata = {
                            "trx": trx_id,
                            "to": trxTo,
                            "amount": trxAmount,
                            "time": time,
                            "type": type
                        };
                        trxArray.push(ddata);
                    }
                }

                if (op_type == "custom_json") {
                    if (op_value.id == "ssc-mainnet-hive") {
                        var jsonParse = JSON.parse(op_value.json);
                        if (jsonParse.contractName == "tokens"
                            && jsonParse.contractAction == "transfer"
                            && jsonParse.contractPayload.symbol == "SWAP.HBD"
                            && jsonParse.contractPayload.to != "uswap.app") {
                            var trxTo = jsonParse.contractPayload.to;
                            var trxAmount = parseFloat(jsonParse.contractPayload.quantity) || 0.0;
                            var type = "SWAP.HIVE";
                            var ddata = {
                                "trx": trx_id,
                                "to": trxTo,
                                "amount": trxAmount,
                                "time": time,
                                "type": type
                            };
                            trxArray.push(ddata);
                        }
                    }
                }
            });
        }
        return trxArray;
    }
    catch (error) {
        console.log("Error At getHistory : ", error);
        return trxArray;
    }
};

const setTimeStamp = async (time) => {
    try {
        var timeISO = time + '.000Z';
        var timeISODate = new Date(timeISO);
        var timeISOMilSec = timeISODate.getTime();
        var timeStamp = parseInt(timeISOMilSec);
        return timeStamp;
    }
    catch (error) {
        console.log("Error at setTimeStamp() : ", error);
    }
};

historyReader();

async function getSelectedEndpoint() {
    var endpoint = await localStorage.getItem("selectedEndpoint");
    if (endpoint) 
    {
      return endpoint;
    } 
    else 
    {
      return "https://anyx.io";
    }
};

async function getSelectedEngEndpoint() {
    var endpoint = await localStorage.getItem("selectedEngEndpoint");
    if (endpoint) 
    {
      return endpoint;
    } 
    else 
    {
      return "https://engine.rishipanthee.com";
    }
};

const getHiveMarket = async () => {
    try
    {
        let hivedata = await axios.get(COINGECKO_HIVE_URL);              
        let hivePrice = parseFloat(hivedata.data.hive.usd);
        //let hbddata = await axios.get(COINGECKO_HBD_URL);                
        //let hbdPrice = parseFloat(hbddata.data.hive_dollar.usd);

        let hbdPrice = await getHBDMarketPrice(hivePrice);
        $("#hiveusdprice").text("$"+hivePrice.toFixed(3));        
        $("#hbdusdprice").text("$"+hbdPrice.toFixed(3)); 
    }
    catch (error)
    {
        console.log("Error at getHiveMarket() : ", error);
    }
};

async function callGetMarketTicker() {
    return new Promise((resolve, reject) => {
        hive.api.getTicker((err, result) => {
            if (err) 
            {
                reject(err);
            } 
            else 
            {
                resolve(result);
            }
        });
    });
};

const getHBDMarketPrice = async (hivePrice) => {
    let hbdPrice = 0.0;
    try
    {
        const response = await callGetMarketTicker();
        let bidPrice = parseFloat(response.highest_bid) || 0.0;
        let askPrice = parseFloat(response.lowest_ask) || 0.0;        
        let avgPrice = Math.floor(((bidPrice + askPrice) / 2) * DECIMAL) / DECIMAL;
        hbdPrice = Math.floor((hivePrice / avgPrice) * DECIMAL) / DECIMAL; 
        console.log("hivePrice: ", hivePrice);
        console.log("hbdPrice: ", hbdPrice);
        return hbdPrice;
    }
    catch (error)
    {
        console.log("Error at getHBDMarketPrice() : ", error);
        return hbdPrice;
    }
};

const getTokenMarket = async () => {
    try
    {        
        let hivedata = await axios.get(COINGECKO_HIVE_URL);              
        let hivePrice = parseFloat(hivedata.data.hive.usd);

        let marketInfo = await getTokenMarketInfo(["VAULT", "UPME", "WINEX", "HELIOS"]);
        console.log("marketInfo : ", marketInfo);

        let vault_price = 0.0, upme_price = 0.0, winex_price = 0.0, helios_price = 0.0;
        if(marketInfo.length > 0)
        {           
            if(marketInfo[0].symbol == "VAULT")
            {
                vault_price = parseFloat(marketInfo[0].lastPrice * hivePrice) || 0.0;
                console.log("vault_price : ", vault_price);
            }
            if(marketInfo[1].symbol == "WINEX")
            {
                winex_price = parseFloat(marketInfo[1].lastPrice * hivePrice) || 0.0;
                console.log("winex_price : ", winex_price);
            }
            if(marketInfo[2].symbol == "HELIOS")
            {
                helios_price = parseFloat(marketInfo[2].lastPrice * hivePrice) || 0.0;
                console.log("helios_price : ", helios_price);
            }
            if(marketInfo[3].symbol == "UPME")
            {
                upme_price = parseFloat(marketInfo[3].lastPrice * hivePrice) || 0.0;
                console.log("upme_price : ", upme_price);
            }
        }
       
        $("#vaultusdprice").text("$"+vault_price.toFixed(3));        
        $("#upmeusdprice").text("$"+upme_price.toFixed(3));
        $("#winexusdprice").text("$"+winex_price.toFixed(3));        
        $("#heliosusdprice").text("$"+helios_price.toFixed(3));
    }
    catch (error)
    {
        console.log("Error at getTokenMarket() : ", error);
    }  
};

const getTokenMarketInfo = async (symbols) => {
    var marketJson = [];
    try
    {        
        marketJson = await ssc.find("market", "metrics", { symbol: { "$in": [...symbols] } }, 1000, 0, []);            
        return marketJson;
    }
    catch (error)
    {
        console.log("Error at getTokenMarketInfo() : ", error);
        return marketJson;
    }
};

const getUswapFeeInfo = async () => {
    try
    {
        let feeData = await axios.get(USWAPFEEJSON);
        return feeData.data;
    }
    catch (error)
    {
        console.log("Error at getUswapFeeInfo() : ", error);
        let ddata = {
            "BASE_FEE": BASE_FEE,
            "MIN_BASE_FEE": MIN_BASE_FEE,
            "DIFF_COEFFICIENT": DIFF_COEFFICIENT,
            "BASE_PRICE_HBD_TO_SHBD": BASE_PRICE_HBD_TO_SHBD
        }        
        return ddata;
    }
};
