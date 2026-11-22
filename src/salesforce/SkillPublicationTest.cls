@IsTest
private class SkillPublicationTest {
    @IsTest
    static void rejectsMissingDatesAndLevelsWithoutDml() {
        SkillPublication.SkillRecord record = new SkillPublication.SkillRecord();
        record.rowNumber = 7;
        record.serviceResourceId = 'R1';
        record.skillId = 'K1';
        record.skillLevel = 0;

        SkillPublication.PublicationRequest request = new SkillPublication.PublicationRequest();
        request.insertions = new List<SkillPublication.SkillRecord>{ record };
        request.updates = new List<SkillPublication.SkillRecord>();

        SkillPublication.PublicationResponse response = SkillPublication.post(request);

        System.assertEquals(1, response.records.size());
        System.assertEquals(false, response.records[0].success);
        System.assert(response.records[0].errors.contains('START_DATE_REQUIRED'));
        System.assert(response.records[0].errors.contains('INVALID_SKILL_LEVEL'));
    }

    @IsTest
    static void supportsAResponseWithoutDeletionOperations() {
        SkillPublication.PublicationRequest request = new SkillPublication.PublicationRequest();
        request.insertions = new List<SkillPublication.SkillRecord>();
        request.updates = new List<SkillPublication.SkillRecord>();

        SkillPublication.PublicationResponse response = SkillPublication.post(request);

        System.assertEquals(0, response.records.size());
    }
}
