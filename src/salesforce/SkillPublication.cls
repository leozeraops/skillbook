@RestResource(urlMapping='/SkillPublication/*')
global with sharing class SkillPublication {
    global class PublicationRequest {
        public List<SkillRecord> insertions;
        public List<SkillRecord> updates;
    }

    global class SkillRecord {
        public Integer rowNumber;
        public String id;
        public String serviceResourceId;
        public String skillId;
        public Decimal skillLevel;
        public Date effectiveStartDate;
        public Date effectiveEndDate;
    }

    global class RecordResult {
        public Integer rowNumber;
        public Boolean success;
        public String id;
        public List<String> errors;

        global RecordResult(Integer rowNumber, Boolean success, String id, List<String> errors) {
            this.rowNumber = rowNumber;
            this.success = success;
            this.id = id;
            this.errors = errors;
        }
    }

    global class PublicationResponse {
        public List<RecordResult> records = new List<RecordResult>();
    }

    @HttpPost
    global static PublicationResponse post(PublicationRequest request) {
        PublicationResponse response = new PublicationResponse();

        List<ServiceResourceSkill> inserts = new List<ServiceResourceSkill>();
        List<Integer> insertRows = new List<Integer>();
        for (SkillRecord record : request.insertions) {
            List<String> validationErrors = validateRecord(record);
            if (!validationErrors.isEmpty()) {
                response.records.add(new RecordResult(record.rowNumber == null ? 0 : record.rowNumber, false, null, validationErrors));
            } else if (rejectVigencyConflict(record, null)) {
                response.records.add(new RecordResult(record.rowNumber == null ? 0 : record.rowNumber, false, null, new List<String>{ 'VIGENCY_OVERLAP' }));
            } else {
                inserts.add(toSObject(record));
                insertRows.add(record.rowNumber == null ? 0 : record.rowNumber);
            }
        }

        Database.SaveResult[] insertResults = Database.insert(inserts, false);
        for (Integer index = 0; index < insertResults.size(); index++) {
            Database.SaveResult result = insertResults[index];
            if (result.isSuccess()) {
                response.records.add(new RecordResult(insertRows[index], true, result.getId(), new List<String>()));
            } else {
                response.records.add(new RecordResult(insertRows[index], false, null, dmlErrors(result.getErrors())));
            }
        }

        List<ServiceResourceSkill> updates = new List<ServiceResourceSkill>();
        List<Integer> updateRows = new List<Integer>();
        for (SkillRecord record : request.updates) {
            List<String> validationErrors = validateRecord(record);
            if (!validationErrors.isEmpty()) {
                response.records.add(new RecordResult(record.rowNumber == null ? 0 : record.rowNumber, false, null, validationErrors));
            } else if (rejectVigencyConflict(record, record.id)) {
                response.records.add(new RecordResult(record.rowNumber == null ? 0 : record.rowNumber, false, null, new List<String>{ 'VIGENCY_OVERLAP' }));
            } else {
                updates.add(toSObject(record));
                updateRows.add(record.rowNumber == null ? 0 : record.rowNumber);
            }
        }

        Database.SaveResult[] updateResults = Database.update(updates, false);
        for (Integer index = 0; index < updateResults.size(); index++) {
            Database.SaveResult result = updateResults[index];
            if (result.isSuccess()) {
                response.records.add(new RecordResult(updateRows[index], true, result.getId(), new List<String>()));
            } else {
                response.records.add(new RecordResult(updateRows[index], false, null, dmlErrors(result.getErrors())));
            }
        }

        return response;
    }

    private static Boolean rejectVigencyConflict(SkillRecord record, String excludedId) {
        if (record.serviceResourceId == null || record.skillId == null || record.effectiveStartDate == null) {
            return false;
        }

        String soql = 'SELECT Id, EffectiveStartDate, EffectiveEndDate FROM ServiceResourceSkill'
            + ' WHERE ServiceResourceId = :resourceId AND SkillId = :skillId';
        Id resourceId = record.serviceResourceId;
        Id skillId = record.skillId;
        for (ServiceResourceSkill existing : Database.query(soql)) {
            if (excludedId != null && existing.Id == excludedId) {
                continue;
            }
            Date existingEnd = existing.EffectiveEndDate == null ? Date.newInstance(9999, 12, 31) : existing.EffectiveEndDate;
            Date recordEnd = record.effectiveEndDate == null ? Date.newInstance(9999, 12, 31) : record.effectiveEndDate;
            if (existing.EffectiveStartDate <= recordEnd && record.effectiveStartDate <= existingEnd) {
                return true;
            }
        }
        return false;
    }

    private static ServiceResourceSkill toSObject(SkillRecord record) {
        return new ServiceResourceSkill(
            Id = record.id,
            ServiceResourceId = record.serviceResourceId,
            SkillId = record.skillId,
            SkillLevel = record.skillLevel,
            EffectiveStartDate = record.effectiveStartDate,
            EffectiveEndDate = record.effectiveEndDate
        );
    }

    private static List<String> validateRecord(SkillRecord record) {
        List<String> errors = new List<String>();
        if (record.ServiceResourceId == null || record.SkillId == null) {
            errors.add('MISSING_IDENTITY');
        }
        if (record.EffectiveStartDate == null) {
            errors.add('START_DATE_REQUIRED');
        }
        if (record.SkillLevel == null || record.SkillLevel <= 0) {
            errors.add('INVALID_SKILL_LEVEL');
        }
        if (record.EffectiveStartDate != null
            && record.EffectiveEndDate != null
            && record.EffectiveEndDate < record.EffectiveStartDate) {
            errors.add('END_DATE_BEFORE_START');
        }
        return errors;
    }

    private static List<String> dmlErrors(List<Database.Error> dmlErrors) {
        List<String> messages = new List<String>();
        for (Database.Error error : dmlErrors) {
            messages.add(error.getStatusCode() + ': ' + error.getMessage());
        }
        return messages;
    }
}
