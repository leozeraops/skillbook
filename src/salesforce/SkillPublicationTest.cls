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
    static void updatesAChangedAssignmentAndReportsUpdated() {
        Skill skill = new Skill(MasterLabel = 'Changed Skill');
        insert skill;
        ServiceResource resource = new ServiceResource(
            Name = 'Changed Resource',
            IsActive = true,
            RelatedRecordId = UserInfo.getUserId()
        );
        insert resource;
        ServiceResourceSkill assignment = new ServiceResourceSkill(
            ServiceResourceId = resource.Id,
            SkillId = skill.Id,
            SkillLevel = 1,
            EffectiveStartDate = Date.today()
        );
        insert assignment;

        SkillPublication.SkillRecord update = new SkillPublication.SkillRecord();
        update.rowNumber = 4;
        update.id = assignment.Id;
        update.serviceResourceId = resource.Id;
        update.skillId = skill.Id;
        update.skillLevel = 3;
        update.effectiveStartDate = Date.today();

        SkillPublication.PublicationRequest request = new SkillPublication.PublicationRequest();
        request.insertions = new List<SkillPublication.SkillRecord>();
        request.updates = new List<SkillPublication.SkillRecord>{ update };

        SkillPublication.PublicationResponse response = SkillPublication.post(request);

        System.assertEquals(1, response.records.size());
        System.assertEquals('UPDATED', response.records[0].status);
        System.assertEquals(true, response.records[0].success);
        ServiceResourceSkill changed = [
            SELECT SkillLevel
            FROM ServiceResourceSkill
            WHERE Id = :assignment.Id
        ];
        System.assertEquals(3, changed.SkillLevel);
    }

    @IsTest
    static void rejectsMalformedIdentityAndBatchOverlap() {
        Skill skill = new Skill(MasterLabel = 'Batch Skill');
        insert skill;
        ServiceResource resource = new ServiceResource(
            Name = 'Batch Resource',
            IsActive = true,
            RelatedRecordId = UserInfo.getUserId()
        );
        insert resource;

        SkillPublication.SkillRecord malformed = new SkillPublication.SkillRecord();
        malformed.rowNumber = 5;
        malformed.serviceResourceId = 'NOT_AN_ID';
        malformed.skillId = 'NOT_AN_ID';
        malformed.skillLevel = 1;
        malformed.effectiveStartDate = Date.today();

        SkillPublication.SkillRecord first = new SkillPublication.SkillRecord();
        first.rowNumber = 6;
        first.serviceResourceId = resource.Id;
        first.skillId = skill.Id;
        first.skillLevel = 1;
        first.effectiveStartDate = Date.today();

        SkillPublication.SkillRecord overlapping = new SkillPublication.SkillRecord();
        overlapping.rowNumber = 7;
        overlapping.serviceResourceId = resource.Id;
        overlapping.skillId = skill.Id;
        overlapping.skillLevel = 2;
        overlapping.effectiveStartDate = Date.today();

        SkillPublication.PublicationRequest request = new SkillPublication.PublicationRequest();
        request.insertions = new List<SkillPublication.SkillRecord>{ malformed, first, overlapping };
        request.updates = new List<SkillPublication.SkillRecord>();

        SkillPublication.PublicationResponse response = SkillPublication.post(request);

        System.assertEquals(true, findResult(response.records, 5).errors.contains('INVALID_SERVICE_RESOURCE_ID'));
        System.assertEquals(true, findResult(response.records, 5).errors.contains('INVALID_SKILL_ID'));
        System.assertEquals(true, findResult(response.records, 6).success);
        System.assertEquals(false, findResult(response.records, 7).success);
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
