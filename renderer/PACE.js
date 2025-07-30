function getQueryParam(param) {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get(param);
}

        // Check eligibility conditions
        if (
            member.age >= 65 &&
            member["Is this person currently enrolled in PACE?"] === "No" &&
            member.medicaid === "No"
        ) {
            if (member.maritalStatus === "Single") {
                if (member.previousYearIncome < 14500) {
                    member.LikelyEligibilities.push("PACE");
                } else if (member.previousYearIncome >= 14501 && member.previousYearIncome <= 33500) {
                    member.LikelyEligibilities.push("PACENET");
                } else if (member.previousYearIncome >= 33501 && member.previousYearIncome <= 43500) {
                    member.LikelyEligibilities.push("Ineligible but within buffer for PACENET");
                }
            } else if (member.maritalStatus === "Married (Living Together)") {
                const combinedIncome = member.previousYearIncome + member.spousePreviousYearIncome;
                if (combinedIncome < 17700) {
                    member.LikelyEligibilities.push("PACE");
                } else if (combinedIncome >= 17701 && combinedIncome <= 41500) {
                    member.LikelyEligibilities.push("PACENET");
                } else if (combinedIncome >= 41501 && combinedIncome <= 51500) {
                    member.LikelyEligibilities.push("Ineligible but within buffer for PACENET");
                }
            }
        } else {
            member.LikelyEligibilities.push("Not eligible for PACE or PACENET");
        }

        // Save the results into the new array
        member.eligibilityResults = [...member.LikelyEligibilities];
    

    // Return the updated clientData
    return clientData;
