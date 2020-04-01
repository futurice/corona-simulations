export default {
    days_from_incubation_to_death: 18, // From Mikko Viikari.
    initial_population_count: 5538328, // 2020 Finnish population count.
    R0: 1.05,
    days_from_incubation_to_infectious: 5.2,     
    days_from_infectious_to_not_infectious: 2.9,
    days_in_mild_recovering_state: 11.1,
    days_in_hospital: 13, // From Mikko Viikari. For comparison, THL's estimate was 8 days (published ~end of march)
    days_in_severe_recovering_state_before_hospital: 11, // From Mikko Viikari. For comparison, THL's estimate was 10 days.
    fatality_rate: 0.006, // From https://www.thelancet.com/journals/laninf/article/PIIS1473-3099%2820%2930243-7/fulltext
    hospitalization_rate: 0.028, // Hospitalization rate. From Mikko Viikari.

    InterventionTime: 60, // this is just where the intervention slider is at initially
    OMInterventionAmt: -1/2, // intervention slider default position
}