LIFECYCLE server scenarios (run against the live project ojclesuwxhtzvrymqrwg, each as ONE execute_sql call):

    begin;
    <00_fixture.sql>
    <scenario file>
    select n,k,v from qa_out order by n;
    rollback;

Nothing commits. No DELETE/DROP is issued against live tables (the connector cancels them).
Scenario G needs a throwaway auth.users row for the commissioner (league_delete_season writes audit_log, FK to auth.users); it is inserted inside the same rolled-back transaction.
Files: A_h2h_lifecycle  B_team4  C_field_join_leave  D_late_dispute_complete  E_subs  F_nine_hole  G_playoffs_delete  H_legacy_latejoiner  I_leaver
