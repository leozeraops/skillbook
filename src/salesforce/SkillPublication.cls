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
        public String status;

        global RecordResult(Integer rowNumber, Boolean success, String id, List<String> errors) {
            this(rowNumber, success, id, errors, success ? 'SUCCESS' : 'FAILED');
        }

        global RecordResult(Integer rowNumber, Boolean success, String id, List<String> errors, String status) {
            this.rowNumber = rowNumber;
            this.success = success;
            this.id = id;
            this.errors = errors;
            this.status = status;
        }
    }

    global class PublicationResponse {
        public List<RecordResult> records = new List<RecordResult>();
    }

    @HttpPost
    global static PublicationResponse post(PublicationRequest request) {
        PublicationResponse response = new PublicationResponse();
        if (request == null) {
            response.records.add(new RecordResult(0, false, null, new List<String>{ 'INVALID_REQUEST' }, 'FAILED'));
            return response;
        }

        List<ServiceResourceSkill> inserts = new List<ServiceResourceSkill>();
        List<Integer> insertRows = new List<Integer>();
        List<SkillRecord> acceptedBatch = new List<SkillRecord>();
        List<SkillRecord> insertions = request.insertions == null
            ? new List<SkillRecord>()
            : request.insertions;
        List<SkillRecord> updatesRequest = request.updates == null
            ? new List<SkillRecord>()
            : request.updates;

        Boolean canInsert = canCreateRecords();
        if (!canInsert) {
            for (SkillRecord record : insertions) {
                response.records.add(new RecordResult(
                    record.rowNumber == null ? 0 : record.rowNumber,
                    false,
                    null,
                    new List<String>{ 'AUTHORIZATION_ERROR' },
                    'FAILED'
                ));
            }
        }

        for (SkillRecord record : insertions) {
            if (!canInsert) {
                continue;
            }
            List<String> validationErrors = validateRecord(record);
            if (!validationErrors.isEmpty()) {
                response.records.add(new RecordResult(record.rowNumber == null ? 0 : record.rowNumber, false, null, validationErrors, 'FAILED'));
            } else if (rejectVigencyConflict(record, null)) {
                response.records.add(new RecordResult(record.rowNumber == null ? 0 : record.rowNumber, false, null, new List<String>{ 'VIGENCY_OVERLAP' }, 'FAILED'));
            } else if (batchConflictError(record, acceptedBatch, null) != null) {
                response.records.add(new RecordResult(
                    record.rowNumber == null ? 0 : record.rowNumber,
                    false,
                    null,
                    new List<String>{ batchConflictError(record, acceptedBatch, null) },
                    'FAILED'
                ));
            } else {
                inserts.add(toSObject(record));
                insertRows.add(record.rowNumber == null ? 0 : record.rowNumber);
                acceptedBatch.add(record);
            }
        }

        if (!inserts.isEmpty()) {
            Database.SaveResult[] insertResults = Database.insert(inserts, false);
            for (Integer index = 0; index < insertResults.size(); index++) {
                Database.SaveResult result = insertResults[index];
                if (result.isSuccess()) {
                    response.records.add(new RecordResult(insertRows[index], true, result.getId(), new List<String>(), 'INSERTED'));
                } else {
                    response.records.add(new RecordResult(insertRows[index], false, null, dmlErrors(result.getErrors()), 'FAILED'));
                }
            }
        }

        List<ServiceResourceSkill> updates = new List<ServiceResourceSkill>();
        List<Integer> updateRows = new List<Integer>();
        Boolean canUpdate = canUpdateRecords();
        if (!canUpdate) {
            for (SkillRecord record : updatesRequest) {
                response.records.add(new RecordResult(
                    record.rowNumber == null ? 0 : record.rowNumber,
                    false,
                    record.id,
                    new List<String>{ 'AUTHORIZATION_ERROR' },
                    'FAILED'
                ));
            }
        }

        Set<Id> updateIds = new Set<Id>();
        Set<Id> processedUpdateIds = new Set<Id>();
        for (SkillRecord record : updatesRequest) {
            if (!canUpdate) {
                continue;
            }
            List<String> validationErrors = validateRecord(record);
            if (record.id == null) {
                validationErrors.add('MISSING_UPDATE_ID');
            }
            if (!validationErrors.isEmpty()) {
                response.records.add(new RecordResult(record.rowNumber == null ? 0 : record.rowNumber, false, null, validationErrors, 'FAILED'));
            } else if (rejectVigencyConflict(record, record.id)) {
                response.records.add(new RecordResult(record.rowNumber == null ? 0 : record.rowNumber, false, null, new List<String>{ 'VIGENCY_OVERLAP' }, 'FAILED'));
            } else {
                try {
                    Id updateId = (Id) record.id;
                    if (processedUpdateIds.contains(updateId)) {
                        response.records.add(new RecordResult(
                            record.rowNumber == null ? 0 : record.rowNumber,
                            false,
                            record.id,
                            new List<String>{ 'EXACT_DUPLICATE' },
                            'FAILED'
                        ));
                    } else {
                        String conflict = batchConflictError(record, acceptedBatch, record.id);
                        if (conflict != null) {
                            response.records.add(new RecordResult(
                                record.rowNumber == null ? 0 : record.rowNumber,
                                false,
                                record.id,
                                new List<String>{ conflict },
                                'FAILED'
                            ));
                        } else {
                            processedUpdateIds.add(updateId);
                            updateIds.add(updateId);
                            acceptedBatch.add(record);
                        }
                    }
                } catch (System.StringException error) {
                    response.records.add(new RecordResult(
                        record.rowNumber == null ? 0 : record.rowNumber,
                        false,
                        null,
                        new List<String>{ 'INVALID_UPDATE_ID' },
                        'FAILED'
                    ));
                }
            }
        }

        Map<Id, ServiceResourceSkill> existingUpdates = new Map<Id, ServiceResourceSkill>();
        if (!updateIds.isEmpty()) {
            existingUpdates.putAll([
                SELECT Id, ServiceResourceId, SkillId, SkillLevel, EffectiveStartDate, EffectiveEndDate
                FROM ServiceResourceSkill
                WHERE Id IN :updateIds
                WITH SECURITY_ENFORCED
            ]);
        }

        Set<Id> handledUpdateIds = new Set<Id>();
        for (SkillRecord record : updatesRequest) {
            if (!canUpdate || record.id == null) {
                continue;
            }
            Id recordId;
            try {
                recordId = (Id) record.id;
            } catch (System.StringException error) {
                continue;
            }
            if (!updateIds.contains(recordId)) {
                continue;
            }
            if (handledUpdateIds.contains(recordId)) {
                continue;
            }
            handledUpdateIds.add(recordId);
            if (!existingUpdates.containsKey(recordId)) {
                response.records.add(new RecordResult(
                    record.rowNumber == null ? 0 : record.rowNumber,
                    false,
                    record.id,
                    new List<String>{ 'UPDATE_RECORD_NOT_FOUND' },
                    'FAILED'
                ));
                continue;
            }
            if (isUnchanged(existingUpdates.get(recordId), record)) {
                response.records.add(new RecordResult(
                    record.rowNumber == null ? 0 : record.rowNumber,
                    true,
                    record.id,
                    new List<String>(),
                    'UNCHANGED'
                ));
            } else {
                updates.add(toSObject(record));
                updateRows.add(record.rowNumber == null ? 0 : record.rowNumber);
            }
        }

        if (!updates.isEmpty()) {
            Database.SaveResult[] updateResults = Database.update(updates, false);
            for (Integer index = 0; index < updateResults.size(); index++) {
                Database.SaveResult result = updateResults[index];
                if (result.isSuccess()) {
                    response.records.add(new RecordResult(updateRows[index], true, result.getId(), new List<String>(), 'UPDATED'));
                } else {
                    response.records.add(new RecordResult(updateRows[index], false, null, dmlErrors(result.getErrors()), 'FAILED'));
                }
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
        Id resourceId;
        Id skillId;
        try {
            resourceId = (Id) record.serviceResourceId;
            skillId = (Id) record.skillId;
        } catch (System.StringException error) {
            return false;
        }
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
        if (record.ServiceResourceId != null) {
            try {
                Id resourceId = (Id) record.ServiceResourceId;
                if (resourceId.getSObjectType() != Schema.ServiceResource.SObjectType) {
                    errors.add('INVALID_SERVICE_RESOURCE_ID');
                }
            } catch (System.StringException error) {
                errors.add('INVALID_SERVICE_RESOURCE_ID');
            }
        }
        if (record.SkillId != null) {
            try {
                Id skillId = (Id) record.SkillId;
                if (skillId.getSObjectType() != Schema.Skill.SObjectType) {
                    errors.add('INVALID_SKILL_ID');
                }
            } catch (System.StringException error) {
                errors.add('INVALID_SKILL_ID');
            }
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

    private static String batchConflictError(
        SkillRecord record,
        List<SkillRecord> acceptedRecords,
        String excludedId
    ) {
        for (SkillRecord accepted : acceptedRecords) {
            if (excludedId != null && accepted.id != null && accepted.id == excludedId) {
                continue;
            }
            if (accepted.serviceResourceId != record.serviceResourceId
                || accepted.skillId != record.skillId) {
                continue;
            }
            if (accepted.effectiveStartDate == record.effectiveStartDate
                && accepted.effectiveEndDate == record.effectiveEndDate) {
                return 'EXACT_DUPLICATE';
            }
            Date acceptedEnd = accepted.effectiveEndDate == null
                ? Date.newInstance(9999, 12, 31)
                : accepted.effectiveEndDate;
            Date recordEnd = record.effectiveEndDate == null
                ? Date.newInstance(9999, 12, 31)
                : record.effectiveEndDate;
            if (accepted.effectiveStartDate <= recordEnd
                && record.effectiveStartDate <= acceptedEnd) {
                return 'VIGENCY_OVERLAP';
            }
        }
        return null;
    }

    private static Boolean canCreateRecords() {
        if (!Schema.sObjectType.ServiceResourceSkill.isCreateable()) {
            return false;
        }
        return fieldCanWrite('ServiceResourceId', false)
            && fieldCanWrite('SkillId', false)
            && fieldCanWrite('SkillLevel', false)
            && fieldCanWrite('EffectiveStartDate', false)
            && fieldCanWrite('EffectiveEndDate', false);
    }

    private static Boolean canUpdateRecords() {
        if (!Schema.sObjectType.ServiceResourceSkill.isUpdateable()) {
            return false;
        }
        return fieldCanWrite('ServiceResourceId', true)
            && fieldCanWrite('SkillId', true)
            && fieldCanWrite('SkillLevel', true)
            && fieldCanWrite('EffectiveStartDate', true)
            && fieldCanWrite('EffectiveEndDate', true);
    }

    private static Boolean fieldCanWrite(String apiName, Boolean forUpdate) {
        Schema.DescribeFieldResult field = Schema.sObjectType.ServiceResourceSkill.fields.getMap()
            .get(apiName)
            .getDescribe();
        return forUpdate ? field.isUpdateable() : field.isCreateable();
    }

    private static Boolean isUnchanged(ServiceResourceSkill existing, SkillRecord record) {
        return existing.ServiceResourceId == record.serviceResourceId
            && existing.SkillId == record.skillId
            && existing.SkillLevel == record.skillLevel
            && existing.EffectiveStartDate == record.effectiveStartDate
            && existing.EffectiveEndDate == record.effectiveEndDate;
    }

    private static List<String> dmlErrors(List<Database.Error> dmlErrors) {
        List<String> messages = new List<String>();
        for (Database.Error error : dmlErrors) {
            messages.add(error.getStatusCode() + ': ' + error.getMessage());
        }
        return messages;
    }
}
