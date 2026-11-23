@IsTest
private class SkillPublicationTest {
    @IsTest
    static void insertsValidRecordAndRejectsInvalidRecordInTheSameBatch() {
        Skill validSkill = new Skill(MasterLabel = 'Test Skill');
        insert validSkill;
        ServiceResource resource = new ServiceResource(
            Name = 'Test Resource',
            IsActive = true,
            RelatedRecordId = UserInfo.getUserId()
        );
        insert resource;

        SkillPublication.SkillRecord valid = new SkillPublication.SkillRecord();
        valid.rowNumber = 1;
        valid.serviceResourceId = resource.Id;
        valid.skillId = validSkill.Id;
        valid.skillLevel = 2;
        valid.effectiveStartDate = Date.today();

        SkillPublication.SkillRecord invalid = new SkillPublication.SkillRecord();
        invalid.rowNumber = 2;
        invalid.serviceResourceId = resource.Id;
        invalid.skillId = validSkill.Id;
        invalid.skillLevel = 0;
        invalid.effectiveStartDate = null;

        SkillPublication.PublicationRequest request = new SkillPublication.PublicationRequest();
        request.insertions = new List<SkillPublication.SkillRecord>{ valid, invalid };
        request.updates = new List<SkillPublication.SkillRecord>();

        Test.startTest();
        SkillPublication.PublicationResponse response = SkillPublication.post(request);
        Test.stopTest();

        System.assertEquals(2, response.records.size());
        SkillPublication.RecordResult validResult = findResult(response.records, 1);
        SkillPublication.RecordResult invalidResult = findResult(response.records, 2);
        System.assertEquals('INSERTED', validResult.status);
        System.assertEquals(true, validResult.success);
        System.assertEquals('FAILED', invalidResult.status);
        System.assertEquals(false, invalidResult.success);
        System.assert(invalidResult.errors.contains('INVALID_SKILL_LEVEL'));
        System.assert(invalidResult.errors.contains('START_DATE_REQUIRED'));
    }

    @IsTest
    static void reportsUpdateWithoutChangesAsUnchanged() {
        Skill skill = new Skill(MasterLabel = 'No Change Skill');
        insert skill;
        ServiceResource resource = new ServiceResource(
            Name = 'No Change Resource',
            IsActive = true,
            RelatedRecordId = UserInfo.getUserId()
        );
        insert resource;
        ServiceResourceSkill assignment = new ServiceResourceSkill(
            ServiceResourceId = resource.Id,
            SkillId = skill.Id,
            SkillLevel = 2,
            EffectiveStartDate = Date.today()
        );
        insert assignment;

        SkillPublication.SkillRecord update = new SkillPublication.SkillRecord();
        update.rowNumber = 3;
        update.id = assignment.Id;
        update.serviceResourceId = resource.Id;
        update.skillId = skill.Id;
        update.skillLevel = 2;
        update.effectiveStartDate = Date.today();

        SkillPublication.PublicationRequest request = new SkillPublication.PublicationRequest();
        request.insertions = new List<SkillPublication.SkillRecord>();
        request.updates = new List<SkillPublication.SkillRecord>{ update };

        SkillPublication.PublicationResponse response = SkillPublication.post(request);

        System.assertEquals(1, response.records.size());
        System.assertEquals('UNCHANGED', response.records[0].status);
        System.assertEquals(true, response.records[0].success);
    }

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

    private static SkillPublication.RecordResult findResult(
        List<SkillPublication.RecordResult> records,
        Integer rowNumber
    ) {
        for (SkillPublication.RecordResult record : records) {
            if (record.rowNumber == rowNumber) {
                return record;
            }
        }
        return null;
    }
}
