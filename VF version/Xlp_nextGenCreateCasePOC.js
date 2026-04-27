import { LightningElement, api, wire, track } from 'lwc';
import { getRecord, updateRecord, getFieldValue, getRecordNotifyChange } from 'lightning/uiRecordApi';
import { getObjectInfo, getPicklistValues, getPicklistValuesByRecordType } from 'lightning/uiObjectInfoApi';

import { subscribe, MessageContext } from 'lightning/messageService';
import MODAL_CHANNEL from '@salesforce/messageChannel/XLP_ComponentModalState__c';

import ACCOUNT_NAME_FIELD from '@salesforce/schema/Opportunity.Account.Name';
import INCEPTION_DATE_FIELD from '@salesforce/schema/Opportunity.XLP_InceptionDate__c';
import BROKER_NAME_FIELD from '@salesforce/schema/Opportunity.XLP_BrokerName__c';
import GLOBAL_PRODUCT_FIELD from '@salesforce/schema/Opportunity.XLP_GlobalProduct__c';
import REGION_FIELD from '@salesforce/schema/Opportunity.XLP_Region__c';
import COUNTRYS_FIELD from '@salesforce/schema/Opportunity.XLP_Countrys__c';
import CLIENT_NAME_FIELD from '@salesforce/schema/Opportunity.XLP_ClientName__c';
import CLIENT_NAME_R from '@salesforce/schema/Opportunity.XLP_ClientName__r.Name';
import NEW_RENEWAL_FIELD from '@salesforce/schema/Opportunity.XLP_NewRenewal__c';
import CONFIDENTIAL_FIELD from '@salesforce/schema/Opportunity.XLP_Confidential__c';

import UNDERWRITING_UNIT_FIELD from '@salesforce/schema/Opportunity.XLP_UnderwritingUnit__c';
import SEGMENT_FIELD from '@salesforce/schema/Opportunity.XLP_Segment__c';
import SUB_REGION_FIELD from '@salesforce/schema/Opportunity.XLP_SubRegion__c';
import PRODUCING_OFFICE_FIELD from '@salesforce/schema/Opportunity.XLP_ProducingOffice__c';
import CURRENCY_ISO_CODE_FIELD from '@salesforce/schema/Opportunity.CurrencyIsoCode';
import ESTIMATED_PREMIUM_FIELD from '@salesforce/schema/Opportunity.XLP_EstimatedPremium__c';
import STAGE_NAME from '@salesforce/schema/Opportunity.StageName';
import PROSPECT_NAME_FIELD from '@salesforce/schema/Opportunity.XLP_ProspectName__c';

import PLANNING_LINE_OF_BUSINESS_FIELD from '@salesforce/schema/Opportunity.XLP_PlanningLineOfBusiness__c';
import RECORD_TYPE_NAME_FIELD from '@salesforce/schema/Opportunity.RecordType.Name';
import OPPORTUNITY_ID_FIELD from '@salesforce/schema/Opportunity.Id';
import OPERATING_BUSINESS_UNIT_FIELD from '@salesforce/schema/Opportunity.XLP_OperatingBusinessUnit__c';

import ACCOUNT_OBJECT from '@salesforce/schema/Account';

import createCase from '@salesforce/apex/XLP_NGN_CreateCaseFromModalController.createCase';
import createEmailMessage from '@salesforce/apex/XLP_NGN_CreateCaseFromModalController.createEmailMessage';
// import uploadAttachment from '@salesforce/apex/XLP_NGN_CreateCaseFromModalController.uploadAttachment'; // REPLACED by REST API
import deleteDuplicateDocuments from '@salesforce/apex/XLP_NGN_CreateCaseFromModalController.deleteDuplicateDocuments';
import getAccountRecordType from '@salesforce/apex/XLP_NGN_CreateCaseFromModalController.getAccountRecordType';
import revertChanges from '@salesforce/apex/XLP_NGN_CreateCaseFromModalController.revertChanges';
import createLogEntry from '@salesforce/apex/XLP_NGN_CreateErrorLog.createLogEntry';
import getQueueList from '@salesforce/apex/XLP_NGN_CreateCaseFromModalController.getQueueList';
import getGroupQueueId from '@salesforce/apex/XLP_NGN_CreateCaseFromModalController.getGroupQueueId';
import getConfidentialFieldAccess from '@salesforce/apex/XLP_NGN_CreateCaseFromModalController.getConfidentialFieldAccess';
import getUserPersona from '@salesforce/apex/XLP_NGN_CreateCaseFromModalController.getUserPersona';
import LOCALE from '@salesforce/i18n/locale';
import TIME_ZONE from '@salesforce/i18n/timeZone';

// ============================================================
// NEW: OAuth Configuration for REST API Upload
// ============================================================
const API_VERSION = 'v66.0';
const OAUTH_AUTHORIZE_URL = 'https://axaxl--xlpdev.sandbox.my.salesforce.com/services/oauth2/authorize';
const CLIENT_ID = 'YOUR_EXTERNAL_CLIENT_APP_CONSUMER_KEY';
const REDIRECT_URI = 'https://axaxl--xlpdev.sandbox.my.salesforce.com/apex/OAuthCallbackHandler';

const NOTIFICATION_DURATION = 15000;
const ERROR_TOAST_MESSAGE_TEMPLATE = 'Unable to link pipeline opportunity to submission. Please refresh the page and try again or open a {0} ticket.';
const ERROR_TOAST_MESSAGE_TEMPLATE_DATA = [
    { 
        url: 'https://silva.service-now.com/esc?id=sc_cat_item&sys_id=5fdaa3446f4c310097e16e2bbb3ee4c1&type=record_producer&SelectedItem=Application%2FSoftware%20Issues', 
        label: 'SILVA' 
    }
];
const NONE_VALUE=[{ label: '--None--', value: '' }];
const SUCCESS_TOAST_MESSAGE = 'Pipeline opportunity updated and submission successfully linked.';
const FIELDS = [
    'Opportunity.Name',
    ACCOUNT_NAME_FIELD,
    INCEPTION_DATE_FIELD,
    BROKER_NAME_FIELD,
    GLOBAL_PRODUCT_FIELD,
    REGION_FIELD,
    COUNTRYS_FIELD,
    CLIENT_NAME_FIELD,
    CLIENT_NAME_R,
    NEW_RENEWAL_FIELD,
    CONFIDENTIAL_FIELD,
    UNDERWRITING_UNIT_FIELD,
    SEGMENT_FIELD,
    SUB_REGION_FIELD,
    PRODUCING_OFFICE_FIELD,
    CURRENCY_ISO_CODE_FIELD,
    ESTIMATED_PREMIUM_FIELD,
    PLANNING_LINE_OF_BUSINESS_FIELD,
    STAGE_NAME,
    PROSPECT_NAME_FIELD,
    RECORD_TYPE_NAME_FIELD,
    OPERATING_BUSINESS_UNIT_FIELD
];

export default class Xlp_nextGenCreateCasePOC extends LightningElement {

    @api modalComponentName;

    subscription = null;
    @api recordId;

    @track showModal;

    @api header;
    @api content;

    @track accRecordTypeId;

    @track opportunityRecordTypeId;
    @track submissionConfirmation;

    @track insuredRecordTypeId;
    @track brokerTargetRecordTypeId;
    @track isLoading = false;

    messageDetails;
    msgFileBase64;
    emailAttachments = [];
    attachmentMap = new Map();

    @track InsuredErrorMessage;
    @track errorMessage = [];
    @track forErrorMeesage;
    @track reviewMessage = 'Review the following fields';
    @track planningLineOfBusinessValue='';
    caseId;
    @track isCaseExist;
    @track isCATChecked = false;
    @track notes;
    caseNumber;
    caseIdURL;
    filter = {};
    brokerFilter = {};
    @track caseOwnerValue='';
    @track queueOptions = [];
    @track queueIdforCaseOwner;
    noneValueoption={ label: '--None--', value: '' };

    // ============================================================
    // NEW: OAuth State Variables
    // ============================================================
    accessToken = null;
    instanceUrl = null;
    tokenExpiry = null;
    pendingEmailId = null;
    oauthInProgress = false;

    get caseCreationTitle() {
        var caseTitle;
        if (this.isCaseExist) {
            caseTitle = 'Submission for ' + this.InsuredAccName;
        } else {
            if(this.InsuredAccName == '' || this.InsuredAccName == null){
                caseTitle = 'Submission creation' ;
            }else{
                caseTitle = 'Submission creation for ' + this.InsuredAccName;
            }
            
        }
        return caseTitle;
    }

    @wire(MessageContext)
    messageContext;

    connectedCallback() {
        console.log('modalComponentName', this.modalComponentName);
        console.log('recordId', this.recordId);
        this.getConfidentialAccess();
        this.handleLoadRecordTypes();
        this.showModal = false;
        this.subscribeToMessageChannel();
        this.handlegetUserPersona();

        // ============================================================
        // NEW: Listen for OAuth messages from popup
        // ============================================================
        window.addEventListener('message', this.handleOAuthMessage);
    }

    disconnectedCallback() {
        // ============================================================
        // NEW: Clean up OAuth listener
        // ============================================================
        window.removeEventListener('message', this.handleOAuthMessage);
    }

    // ============================================================
    // NEW: OAuth Message Handler (arrow function preserves 'this')
    // ============================================================
    handleOAuthMessage = (event) => {
        console.log('Received message:', event.data);
        console.log('From origin:', event.origin);

        const data = event.data;

        if (data.type === 'OAUTH_TOKEN') {
            console.log('Token received!');
            this.accessToken = data.accessToken;
            this.instanceUrl = data.instanceUrl;
            this.tokenExpiry = Date.now() + ((data.expiresIn || 3600) * 1000);
            this.oauthInProgress = false;

            // Resume upload with new token
            if (this.pendingEmailId) {
                this.uploadAttachmentsViaRestApi(this.emailAttachments, this.pendingEmailId);
            }

        } else if (data.type === 'OAUTH_ERROR') {
            this.oauthInProgress = false;
            this.isLoading = false;
            this.showToast("Error", `OAuth failed: ${data.errorDescription}`, 'error', 'dismissible');
        }
    };

    @track confidentialDisabled = false;
    async getConfidentialAccess(){
        await getConfidentialFieldAccess({ opportunityId: this.recordId })
            .then((result) => {
                this.confidentialDisabled = !result;
                console.log('Confidential disabled:', this.confidentialDisabled);
            })
            .catch((error) => {
                console.error('getConfidentialAccess == ' + error);
            });
    }

    handleCatModelingRequest(event) {
        this.isCATChecked = event.target.checked;
    }
    handleNotesRequest(event) {
        this.notes = event.target.value;
    }

    caseURL() {
        if (this.isCaseExist) {
            this.submissionConfirmation = 'Pipeline opportunity is linked to ';
            this.caseIdURL = '/lightning/r/Case/' + this.caseId + '/view';
        } else {
            this.submissionConfirmation = 'You are creating a new submission for this pipeline opportunity. ';
        }
    }

    subscribeToMessageChannel() {
        console.log('subscribe to message channel');
        this.subscription = subscribe(
            this.messageContext,
            MODAL_CHANNEL,
            (message) => this.handleMessage(message)
        );
    }

    handleMessage(message) {
        console.log('handle LMS channel message', JSON.stringify(message.targetComponent));
        if (message.targetComponent !== this.modalComponentName) {
            return;
        }

        this.recordId = message.recordId;
        this.showModal = message.modalOpen;
        this.messageDetails = message.details;
        console.log('Message details -> '+JSON.stringify(message.details));
        this.isCaseExist = message.caseData.caseExists;
        if (this.isCaseExist) {
            this.caseId = message.caseData.caseId;
            this.caseNumber = message.caseData.caseNumber;
            this.caseNumber = 'Case ' + this.caseNumber + '.';
        }
        this.caseURL();
        if (this.messageDetails.emailData) {
            this.subject = this.messageDetails.emailData.subject;
            let msgText = this.subject; 
            console.log("subject Length -> "+msgText.length);
            if(msgText.length > 70){
                //this.subject = this.subject.slice(0, 67);
            }
            this.senderEmail = this.messageDetails.emailData.senderEmail;
            this.senderName = this.messageDetails.emailData.senderName;
            this.toRecipients = this.messageDetails.emailData.toRecipients;
            this.textBody = this.messageDetails.emailData.textBody;
            this.htmlBody = this.messageDetails.emailData.htmlBody;
            this.headers = this.messageDetails.emailData.headers;
            this.msgFileBase64 = this.messageDetails.base64Msg;
            this.emailReceivedDate = this.messageDetails.emailData.receivedDateTime;
            this.emailReceivedDate = this.formatDate(this.emailReceivedDate);

            let emlAtt = this.messageDetails.attachments;
            this.emailAttachments = emlAtt ? emlAtt : undefined;

            this.emailAttachments.forEach(e => {
                this.attachmentMap[e.id] = e.save;
            });
        }
        console.log('this.showModal ==== '+this.showModal);
    }

    handleFileSelect(event) {
        const { fileId, isChecked } = event.detail;

        for (let i = 0; i < this.emailAttachments.length; i++) {
            const el = this.emailAttachments[i];
            if (el.id !== fileId) continue;

            this.attachmentMap[fileId] = isChecked;
        }
    }

    @track recordTypeId;
    async handleLoadRecordTypes() {
        await getAccountRecordType()
            .then((result) => {
                if (result) {
                    const accountRecordTypeInfos = result;
                    for (let key in accountRecordTypeInfos) {
                        if (accountRecordTypeInfos[key].Name == 'Broker') {
                            this.brokerTargetRecordTypeId = accountRecordTypeInfos[key].Id;
                            console.log('handleLoadRecordTypes Broker ==== ' + this.brokerTargetRecordTypeId);
                        }
                        if (accountRecordTypeInfos[key].Name == 'Insured') {
                            this.insuredRecordTypeId = accountRecordTypeInfos[key].Id;
                            console.log('handleLoadRecordTypes Insured ==== ' + this.insuredRecordTypeId);
                        }
                    }
                    this.filter = {
                        criteria: [{
                            fieldPath: 'RecordTypeId',
                            operator: 'eq',
                            value: this.insuredRecordTypeId
                        }]
                    };

                    this.brokerFilter = {
                        criteria: [{
                            fieldPath: 'RecordTypeId',
                            operator: 'eq',
                            value: this.brokerTargetRecordTypeId
                        }]
                    };

                    console.log('handleLoadRecordTypes result ==== ' + JSON.stringify(result));
                }
            })
            .catch((error) => {
                console.error('handleLoadRecordTypes == ' + error);
            });
    }
    selectedTarget = 'Account';

    matchingInfo = {
        primaryField: { fieldPath: "XLP_LegalName__c" },
    };

    @track currentSelectedRecordId;
    handleRecordSelect(event) {
        this.currentSelectedRecordId = event.detail.recordId;
    }

    @track getRecordData;
    @wire(getRecord, { recordId: '$recordId', fields: FIELDS })
    wiredRecord({ error, data }) {
        if (data) {
            this.getRecordData = data;
            this.InsuredAccName = '';
            this.InsuredAccName = data.fields.XLP_ClientName__r ? data.fields.XLP_ClientName__r.value?.fields.Name.value : null;
            if (data.recordTypeInfo) {
                if (data.recordTypeInfo.name == 'Opportunity Pipeline Renewal') {
                    this.opportunityRecordTypeId = data.recordTypeInfo.recordTypeId;
                }
                if (data.recordTypeInfo.name == 'Opportunity Pipeline') {
                    this.opportunityRecordTypeId = data.recordTypeInfo.recordTypeId;
                }
            }
            if (data.fields) {
                this.opportunityInfo(data.fields);
                if (data.fields.Account) {
                    this.accountInfo(data.fields.Account);
                }
            }
        } else if (error) {
            console.error('Error: ', error);
        }
    }

    // ... ALL YOUR EXISTING @wire METHODS REMAIN UNCHANGED ...
    @track globalProductPickOptions;
    @track regionPickOptions;
    @track subRegionPickOptions;
    @track totalSubRegionData;
    @track totalUnderwritingUnitData;
    @track uwControlValues;
    @track countryPickOptions;
    @track plannigLineBusinessPickOptions;
    @track stageNamePickOptions;
    @track newRenewalPickOptions;
    @track underitingUnitPickOptions;
    @track segmentPickOptions;
    @track productionOfficePickOptions;
    @track currencyIsoCodePickOptions;
    @track operatingBusinessUnitPickOptions;
    @track totalOperatingBusinessUnitData;
    @track oBUControlValues;
    @track totalPlannigLineBusinessUnitData;
    @track pLBControlValues;

    @wire(getPicklistValues, { recordTypeId: '$opportunityRecordTypeId', fieldApiName: OPERATING_BUSINESS_UNIT_FIELD })
    wireOperatingBusinessUnitPickValues({ error, data }) {
        if (data) {
            this.totalOperatingBusinessUnitData = data.values;
            this.oBUControlValues = data.controllerValues;
        } else if (error) {
            console.error('Error retrieving picklist values: ', error);
        }
    }

    @wire(getPicklistValues, { recordTypeId: '$opportunityRecordTypeId', fieldApiName: CURRENCY_ISO_CODE_FIELD })
    wireCurrencyIsoCodePickValues({ error, data }) {
        if (data) {
            this.currencyIsoCodePickOptions = data.values;
            this.currencyIsoCodePickOptions=[this.noneValueoption, ...this.currencyIsoCodePickOptions];
        } else if (error) {
            console.error('Error retrieving picklist values: ', error);
        }
    }

    @wire(getPicklistValues, { recordTypeId: '$opportunityRecordTypeId', fieldApiName: PRODUCING_OFFICE_FIELD })
    wireProductionOfficePickValues({ error, data }) {
        if (data) {
            this.productionOfficePickOptions = data.values;
            this.productionOfficePickOptions=[this.noneValueoption, ...this.productionOfficePickOptions];
        } else if (error) {
            console.error('Error retrieving picklist values: ', error);
        }
    }

    @wire(getPicklistValues, { recordTypeId: '$opportunityRecordTypeId', fieldApiName: SEGMENT_FIELD })
    wireSegmentPickValues({ error, data }) {
        if (data) {
            this.segmentPickOptions = data.values;
            this.segmentPickOptions=[this.noneValueoption, ...this.segmentPickOptions];
        } else if (error) {
            console.error('Error retrieving picklist values: ', error);
        }
    }

    @wire(getPicklistValues, { recordTypeId: '$opportunityRecordTypeId', fieldApiName: NEW_RENEWAL_FIELD })
    wireNewRenewalPickValues({ error, data }) {
        if (data) {
            this.newRenewalPickOptions = data.values;
            this.newRenewalPickOptions=[this.noneValueoption, ...this.newRenewalPickOptions];
        } else if (error) {
            console.error('Error retrieving picklist values: ', error);
        }
    }

    @wire(getPicklistValues, { recordTypeId: '$opportunityRecordTypeId', fieldApiName: STAGE_NAME })
    wireStageNamePickValues({ error, data }) {
        if (data) {
            this.stageNamePickOptions = data.values;
        } else if (error) {
            console.error('Error retrieving picklist values: ', error);
        }
    }

    @wire(getPicklistValues, { recordTypeId: '$opportunityRecordTypeId', fieldApiName: GLOBAL_PRODUCT_FIELD })
    wireGlobalProductPickValues({ error, data }) {
        if (data) {
            this.globalProductPickOptions = data.values;
            this.globalProductPickOptions=[this.noneValueoption, ...this.globalProductPickOptions];
        } else if (error) {
            console.error('Error retrieving picklist values: ', error);
        }
    }

    @wire(getPicklistValues, { recordTypeId: '$opportunityRecordTypeId', fieldApiName: UNDERWRITING_UNIT_FIELD })
    wireUnderitingUnitPickValues({ error, data }) {
        if (data) {
            this.totalUnderwritingUnitData = data.values;
            this.uwControlValues = data.controllerValues;
        } else if (error) {
            console.error('Error retrieving picklist values: ', error);
        }
    }

    @wire(getPicklistValues, { recordTypeId: '$opportunityRecordTypeId', fieldApiName: COUNTRYS_FIELD })
    wireCountryPickValues({ error, data }) {
        if (data) {
            this.countryPickOptions = data.values;
        } else if (error) {
            console.error('Error retrieving picklist values: ', error);
        }
    }

    @wire(getPicklistValues, { recordTypeId: '$opportunityRecordTypeId', fieldApiName: REGION_FIELD })
    wireRegionPickValues({ error, data }) {
        if (data) {
            this.regionPickOptions = data.values;
            this.regionPickOptions=[this.noneValueoption, ...this.regionPickOptions];
        } else if (error) {
            console.error('Error retrieving picklist values: ', error);
        }
    }

    @wire(getPicklistValues, { recordTypeId: '$opportunityRecordTypeId', fieldApiName: PLANNING_LINE_OF_BUSINESS_FIELD })
    wirePlaningLinePickValues({ error, data }) {
        if (data) {
            this.totalPlannigLineBusinessUnitData = data.values;
            this.pLBControlValues = data.controllerValues;
        } else if (error) {
            console.error('Error retrieving picklist values: ', error);
        }
    }

    @track controlValues;

    @wire(getPicklistValues, { recordTypeId: '$opportunityRecordTypeId', fieldApiName: SUB_REGION_FIELD })
    wireSubRegionPickValues({ error, data }) {
        if (data) {
            this.totalSubRegionData = data.values;
            this.controlValues = data.controllerValues;
        } else if (error) {
            console.error('Error retrieving picklist values: ', error);
        }
    }

    // ... ALL YOUR EXISTING HANDLERS REMAIN UNCHANGED ...
    selectedRegion;
    handleRegionChange(event) {
        this.selectedRegion = event.target.value;
        this.subRegionValue = '';
        const controllerValueIndex = this.controlValues[this.selectedRegion];
        this.subRegionPickOptions = this.totalSubRegionData.filter(opt =>
            opt.validFor.includes(controllerValueIndex)
        );
        this.subRegionPickOptions=[this.noneValueoption, ...this.subRegionPickOptions];
    }

    selectedGlobalProduct;
    handleGlobalProductChange(event) {
        this.selectedGlobalProduct = event.target.value;
        this.undewritingUnitValue = '';
        this.operatingBusinessUnitValue = '';
        this.planningLineOfBusinessValue = '';
        this.caseOwnerValue='';
        this.operatingBusinessUnitPickOptions=NONE_VALUE;
        this.plannigLineBusinessPickOptions=NONE_VALUE;
         this.queueOptions=NONE_VALUE;
        const uwcontrollerValueIndex = this.uwControlValues[this.selectedGlobalProduct];
        this.underitingUnitPickOptions = this.totalUnderwritingUnitData.filter(opt =>
            opt.validFor.includes(uwcontrollerValueIndex)
        );
         this.underitingUnitPickOptions=[this.noneValueoption, ...this.underitingUnitPickOptions];
    }

    @track InsuredAccName;
    @track prospectAccName;

    @track inceptionDate;
    @track globalProductValue;
    @track regionValue;
    @track countryValue;
    @track clientNameId;
    @track brockerNameId;
    @track stageNameValue;
    @track newRenewalValue = '';
    @track confidentialValue;
    @track undewritingUnitValue;
    @track segmentValue;
    @track productionOfficeValue;
    @track oppCurrencyValue;
    @track estimatedPremiumValue;
    @track subRegionValue;
    @track prospectNameValue;
    @track caseValue;
    @track status;
    @track subject;
    @track senderEmail;
    @track senderName;
    @track toRecipients;
    @track textBody;
    @track htmlBody;
    @track headers;
    @track emailReceivedDate;
    @track operatingBusinessUnitValue='';

    // ... opportunityInfo, accountInfo, handleConfidentialChange REMAIN UNCHANGED ...
    opportunityInfo(opportunityData) {
        if (opportunityData.XLP_ProspectName__c) {
            this.prospectNameValue = opportunityData.XLP_ProspectName__c.value;
        }
        if (opportunityData.Case__c) {
            this.caseValue = opportunityData.Case__c.value;
        }

        if (opportunityData.XLP_SubRegion__c) {
            this.subRegionValue = opportunityData.XLP_SubRegion__c.value;
            if(this.subRegionValue == null || this.subRegionValue == ''){
                this.subRegionValue = '';
            }
        }
        if (opportunityData.XLP_EstimatedPremium__c) {
            this.estimatedPremiumValue = opportunityData.XLP_EstimatedPremium__c.value;
        }
        if (opportunityData.CurrencyIsoCode) {
            this.oppCurrencyValue = opportunityData.CurrencyIsoCode.value;
        }
        if (opportunityData.XLP_ProducingOffice__c) {
            this.productionOfficeValue = opportunityData.XLP_ProducingOffice__c.value;
            if(this.productionOfficeValue == null || this.productionOfficeValue == ''){
                this.productionOfficeValue = '';
            }
        }
        if (opportunityData.XLP_Segment__c) {
            this.segmentValue = opportunityData.XLP_Segment__c.value;
            if(this.segmentValue == null || this.segmentValue == ''){
                this.segmentValue = '';
            }
        }

        if (opportunityData.XLP_Confidential__c) {
            this.confidentialValue = opportunityData.XLP_Confidential__c.value;
        }
        if (opportunityData.XLP_NewRenewal__c) {
            this.newRenewalValue = opportunityData.XLP_NewRenewal__c.value;
            if(this.newRenewalValue == null || this.newRenewalValue == ''){
                this.newRenewalValue = '';
            }
        }
        if (opportunityData.StageName) {
            this.stageNameValue = opportunityData.StageName.value;
        }
        if (opportunityData.XLP_BrokerName__c) {
            this.brockerNameId = opportunityData.XLP_BrokerName__c.value;
        }
        if (opportunityData.XLP_ClientName__c) {
            this.clientNameId = opportunityData.XLP_ClientName__c.value;
        }
        if (opportunityData.XLP_GlobalProduct__c) {
            this.globalProductValue = opportunityData.XLP_GlobalProduct__c.value;
            if(this.globalProductValue == null || this.globalProductValue == ''){
                this.globalProductValue = '';
            }
            let uwcontrollerValueIndex;

            if (this.uwControlValues) {
                Object.entries(this.uwControlValues).forEach(([key, value]) => {
                    if (key === this.globalProductValue) {
                        uwcontrollerValueIndex = value;
                    }
                });
                this.underitingUnitPickOptions = this.totalUnderwritingUnitData.filter(opt =>
                    opt.validFor.includes(uwcontrollerValueIndex)
                );
                this.underitingUnitPickOptions=[this.noneValueoption, ...this.underitingUnitPickOptions];
            }

        }
        if (opportunityData.XLP_UnderwritingUnit__c) {
            this.undewritingUnitValue = opportunityData.XLP_UnderwritingUnit__c.value;
            if(this.undewritingUnitValue == null || this.undewritingUnitValue == ''){
                this.undewritingUnitValue = '';
            }
            this.getQueueList(this.undewritingUnitValue);
            let oBUcontrollerValueIndex;
            if (this.oBUControlValues) {
                Object.entries(this.oBUControlValues).forEach(([key, value]) => {
                    if (key === this.undewritingUnitValue) {
                        oBUcontrollerValueIndex = value;
                    }
                });
                this.operatingBusinessUnitPickOptions = this.totalOperatingBusinessUnitData.filter(opt =>
                    opt.validFor.includes(oBUcontrollerValueIndex)
                );
                this.operatingBusinessUnitPickOptions=[this.noneValueoption, ...this.operatingBusinessUnitPickOptions];
            }

        }
        if (opportunityData.XLP_OperatingBusinessUnit__c) {
            this.operatingBusinessUnitValue = opportunityData.XLP_OperatingBusinessUnit__c.value;
            let pLBcontrollerValueIndex;
            if (this.pLBControlValues) {
                Object.entries(this.pLBControlValues).forEach(([key, value]) => {
                    if (key === this.operatingBusinessUnitValue) {
                        pLBcontrollerValueIndex = value;
                    }
                });
                this.plannigLineBusinessPickOptions = this.totalPlannigLineBusinessUnitData.filter(opt =>
                    opt.validFor.includes(pLBcontrollerValueIndex)
                );

                this.plannigLineBusinessPickOptions=[this.noneValueoption, ...this.plannigLineBusinessPickOptions];
                if(this.operatingBusinessUnitValue==null || this.operatingBusinessUnitValue==''){
                    this.operatingBusinessUnitValue='';
                }
            }

        }
        if (opportunityData.XLP_PlanningLineOfBusiness__c) {
            this.planningLineOfBusinessValue = opportunityData.XLP_PlanningLineOfBusiness__c.value;
            if(this.planningLineOfBusinessValue==''||this.planningLineOfBusinessValue==null){
                this.planningLineOfBusinessValue='';
            }
        }
        if (opportunityData.XLP_Region__c) {
            this.regionValue = opportunityData.XLP_Region__c.value;
            if(this.regionValue == null || this.regionValue == ''){
                this.regionValue = '';
            }
            let controllerValueIndex;

            if (this.controlValues) {
                Object.entries(this.controlValues).forEach(([key, value]) => {
                    if (key === this.regionValue) {
                        controllerValueIndex = value;
                    }
                });
                this.subRegionPickOptions = this.totalSubRegionData.filter(opt =>
                    opt.validFor.includes(controllerValueIndex)
                );
                this.subRegionPickOptions=[this.noneValueoption, ...this.subRegionPickOptions];
            }

        }

        if (opportunityData.XLP_Countrys__c) {
            this.countryValue = opportunityData.XLP_Countrys__c.value;
        }

        if (opportunityData.XLP_InceptionDate__c) {
            this.inceptionDate = opportunityData.XLP_InceptionDate__c.value;
        }
    }

    handleConfidentialChange(event){
        this.confidentialValue = event.detail.checked;
    }

    accountInfo(accountData) {
        if (accountData.value) {
            if (accountData.value.fields) {
                if (accountData.value.fields.Name) {
                    this.accRecordTypeId = accountData.value.recordTypeId;
                }
            }
        }
    }

    handleChange(event) {
        console.log('event detail: ', JSON.stringify(event.detail, null, 2));
    }

    handleClose() {
        this.showModal = false;
        this.showPopup = false;
        this.showError = false;
        this.isLoading = false;
    }

    handleCaseCreation() {
        // ... REMAINS UNCHANGED ...
        const recordInput = this.updateOpportunityData();
        const wrapperData = {
            pipelineOpportunityId: this.recordId,
            caseId: this.caseId || null,
            status: 'Log Submission',
            subject: this.subject,
            accountName: this.accRecordTypeId,
            opportunityId: this.currentSelectedRecordId,
            currencyIsoCode: recordInput.CurrencyIsoCode,
            insuredName: recordInput.XLP_ClientName__c,
            newRenewal: recordInput.XLP_NewRenewal__c,
            inceptionDate: recordInput.XLP_InceptionDate__c,
            brokerName: recordInput.XLP_BrokerName__c,
            globalProduct: recordInput.XLP_GlobalProduct__c,
            uWUnit: recordInput.XLP_UnderwritingUnit__c,
            region: recordInput.XLP_Region__c,
            producingOffice: recordInput.XLP_ProducingOffice__c,
            senderEmail: this.senderEmail,
            senderName: this.senderName,
            toRecipients: this.toRecipients,
            textBody: this.textBody,
            htmlBody: this.htmlBody,
            headers: this.headers,
            catModellingCheck: this.isCATChecked,
            additionalNote: this.notes,
            operatingBusinessUnit: recordInput.XLP_OperatingBusinessUnit__c,
            planningLineOfBusiness: recordInput.XLP_PlanningLineOfBusiness__c,
            caseOwnerQueueId: this.queueIdforCaseOwner
        };

        let jsonString = JSON.stringify(wrapperData);
        return jsonString;
    }

    showToast(title, message, variant, mode) {
        let duration = NOTIFICATION_DURATION;
        console.log('LWC show toast, send event');
        const myToastEvent = new CustomEvent('showtoast', {
            detail: { 
                title: title,
                message: message,
                messageTemplate: variant === 'error' ? ERROR_TOAST_MESSAGE_TEMPLATE : undefined,
                messageTemplateData: variant === 'error' ? ERROR_TOAST_MESSAGE_TEMPLATE_DATA : undefined,
                type: variant,
                mode: mode,
                duration: duration
            }
        });
        console.log('LWC event:', JSON.stringify(myToastEvent, null, 2));
        this.dispatchEvent(myToastEvent);
    }

    // ============================================================
    // MODIFIED: handleSave with OAuth + REST API Upload
    // ============================================================
    async handleSave(event) {
        console.log('HANDLE SAVE');
        var isValid = this.validateAll();
        let oppUpdated = false;
        let caseCreated = false;
        let emailCreated = false;
        let attachmentsCreated = false;

        if (isValid) {
            this.isLoading = true;
            const recordInput = this.updateOpportunityData();
            const testJSON = { fields: recordInput };
            let recordUpdateStatus = false;
            let logId;
            await updateRecord(testJSON)
                .then(() => {
                    oppUpdated = true;
                    recordUpdateStatus = true;
                })
                .catch((error) => {
                    console.error('Error message', error);
                    this.showToast("Error", "ERROR", 'error', 'dismissible');
                    let errMessage = error.body?.message || error.body.message;
                    logId = createLogEntry({message: errMessage, stacktrace: JSON.stringify(error), originType:'NGN_xlp_nextgenCreateCase'})
                    this.isLoading = false;
                    return;
                });

            if (!recordUpdateStatus) return;

            let saveJson = this.handleCaseCreation();
            getRecordNotifyChange([{ recordId: this.recordId }]);

            let newCaseId;
            let emailId;
            try {
                if (!this.isCaseExist) {
                    console.log('create case start');
                    newCaseId = await createCase({ jsonFromModal: saveJson });
                    caseCreated = true;
                }

                console.log('create EmailMessage start');
                emailId = await createEmailMessage({ jsonFromModal: saveJson, caseId: newCaseId });
                emailCreated = true;
                console.log('EMAIL ID FROM APEX-------->', emailId);

                // ============================================================
                // NEW: OAuth + REST API Upload (replaces Apex uploadAttachment)
                // ============================================================
                if (this.emailAttachments && this.emailAttachments.length > 0) {
                    console.log('uploading attachments via REST API start');
                    
                    // Store emailId for after OAuth
                    this.pendingEmailId = emailId;
                    
                    // Check if we need OAuth token
                    if (!this.accessToken || this.isTokenExpired()) {
                        this.openOAuthPopup();
                        // Upload will resume in handleOAuthMessage when token arrives
                        attachmentsCreated = true; // Will be processed async
                    } else {
                        // We have token, upload directly
                        await this.uploadAttachmentsViaRestApi(this.emailAttachments, emailId);
                        attachmentsCreated = true;
                        console.log('schedule XLI document duplicate removal');
                        await deleteDuplicateDocuments({ emailMessagegID: emailId });
                    }
                } else {
                    attachmentsCreated = true;
                }

                // Only close if we didn't open OAuth popup (async case handled in handleOAuthMessage)
                if (!this.oauthInProgress) {
                    this.handleClose();
                    if (oppUpdated && caseCreated && emailCreated && attachmentsCreated) {
                        this.showToast('Success', SUCCESS_TOAST_MESSAGE, 'success', 'dismissible');
                        this.isLoading = false;
                    }
                }
                
            } catch (error) {
                this.isLoading = false;
                console.error('Error:', error);
                console.log('REVERT CHANGES', 'emailId:', emailId, 'newCaseId:', newCaseId);
                this.showToast("Error", "ERROR", 'error', 'dismissible');
                try {
                    await revertChanges({ emailId: emailId, caseId: newCaseId });
                } catch (error) {
                    console.error('Error:', error);
                }
            } finally {
                getRecordNotifyChange([{ recordId: this.recordId }]);
            }
        }
    }

    // ============================================================
    // NEW: OAuth Popup Methods
    // ============================================================
    
    openOAuthPopup() {
        this.oauthInProgress = true;
        
        const vfPageUrl = '/apex/OAuthCallbackHandler';
        
        const popup = window.open(
            vfPageUrl,
            'oauthPopup',
            'width=600,height=700,scrollbars=yes,resizable=yes'
        );

        if (!popup || popup.closed || typeof popup.closed === 'undefined') {
            this.oauthInProgress = false;
            this.isLoading = false;
            this.showToast('Error', 'Popup blocked! Please allow popups for this site.', 'error', 'dismissible');
            return;
        }
        
        console.log('OAuth popup opened, waiting for token...');
    }

    isTokenExpired() {
        return !this.tokenExpiry || Date.now() >= this.tokenExpiry;
    }

    // ============================================================
    // NEW: REST API Upload Methods
    // ============================================================

    async uploadAttachmentsViaRestApi(attachments, emailId) {
        const total = attachments.length;
        let uploadedCount = 0;

        for (let i = 0; i < total; i++) {
            const attData = attachments[i];
            
            // Skip if user unchecked this attachment
            if (attData && this.attachmentMap[attData.id] === false) {
                console.log('Skipping attachment (unchecked):', attData.fileName);
                continue;
            }

            if (attData && attData.base64) {
                try {
                    await this.uploadSingleAttachmentViaRest(attData, emailId);
                    uploadedCount++;
                    console.log(`Uploaded ${uploadedCount}/${total}: ${attData.fileName}`);
                } catch (error) {
                    console.error('Failed to upload:', attData.fileName, error);
                    // Continue with other attachments even if one fails
                }
            }
        }

        // After all uploads, delete duplicates
        try {
            await deleteDuplicateDocuments({ emailMessagegID: emailId });
        } catch (error) {
            console.error('Error deleting duplicates:', error);
        }

        // Reset state
        this.pendingEmailId = null;
        this.oauthInProgress = false;
        this.isLoading = false;
        this.handleClose();
        this.showToast('Success', SUCCESS_TOAST_MESSAGE, 'success', 'dismissible');
    }

    async uploadSingleAttachmentViaRest(attachment, emailId) {
        const blob = this.base64ToBlob(attachment.base64, this.getMimeType(attachment.extension));
        
        const boundary = '----sfboundary' + Date.now();
        const endpoint = `${this.instanceUrl}/services/data/${API_VERSION}/sobjects/ContentVersion`;
        
        const entityContent = {
            Title: attachment.fileName,
            PathOnClient: attachment.fileName,
            ContentLocation: 'S',
            FirstPublishLocationId: emailId  // Link to EmailMessage
        };

        const metadataPart = 
            `--${boundary}\r\n` +
            `Content-Disposition: form-data; name="entity_content"\r\n` +
            `Content-Type: application/json\r\n\r\n` +
            `${JSON.stringify(entityContent)}\r\n`;

        const fileHeaderPart = 
            `--${boundary}\r\n` +
            `Content-Disposition: form-data; name="VersionData"; filename="${this.escapeHeader(attachment.fileName)}"\r\n` +
            `Content-Type: ${this.getMimeType(attachment.extension)}\r\n\r\n`;

        const closingPart = `\r\n--${boundary}--`;

        const requestBody = new Blob([
            metadataPart,
            fileHeaderPart,
            blob,
            closingPart
        ], { type: `multipart/form-data; boundary=${boundary}` });

        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${this.accessToken}`,
                'Content-Type': `multipart/form-data; boundary=${boundary}`
            },
            body: requestBody
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HTTP ${response.status}: ${errorText}`);
        }

        return response.json();
    }

    base64ToBlob(base64, mimeType) {
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
        }
        return new Blob([bytes], { type: mimeType });
    }

    getMimeType(extension) {
        const mimeTypes = {
            '.pdf': 'application/pdf',
            '.doc': 'application/msword',
            '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            '.xls': 'application/vnd.ms-excel',
            '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            '.ppt': 'application/vnd.ms-powerpoint',
            '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.png': 'image/png',
            '.gif': 'image/gif',
            '.txt': 'text/plain',
            '.csv': 'text/csv',
            '.zip': 'application/zip',
            '.msg': 'application/vnd.ms-outlook',
            '.eml': 'message/rfc822'
        };
        return mimeTypes[extension?.toLowerCase()] || 'application/octet-stream';
    }

    escapeHeader(value) {
        return String(value || '').replace(/"/g, '\\"').replace(/[\r\n]/g, '');
    }

    // ============================================================
    // REMOVED: Old Apex upload method (replaced by REST API)
    // ============================================================
    /*
    async uploadAttachmentsSequentially(attachments, emailId) {
        const total = attachments.length;
        for (let i = 0; i < total; i++) {
            const attData = attachments[i];
            if (attData && this.attachmentMap[attData.id] !== false) {
                await uploadAttachment({
                    linkedEntityId: emailId,
                    fileName: attData.fileName,
                    base64Content: attData.base64
                });
            }
        }
    }
    */

    // ... ALL REMAINING METHODS UNCHANGED ...
    updateOpportunityData() {
        const FIELDS = {};
        FIELDS[OPPORTUNITY_ID_FIELD.fieldApiName] = this.recordId;
        FIELDS[CLIENT_NAME_FIELD.fieldApiName] = this.template.querySelector("[data-field='InsuredName']").value;
        FIELDS[PROSPECT_NAME_FIELD.fieldApiName] = this.template.querySelector("[data-field='ProspectName']").value;
        FIELDS[NEW_RENEWAL_FIELD.fieldApiName] = this.template.querySelector("[data-field='NewRenewal']").value;
        FIELDS[INCEPTION_DATE_FIELD.fieldApiName] = this.template.querySelector("[data-field='InceptionDate']").value;
        FIELDS[BROKER_NAME_FIELD.fieldApiName] = this.template.querySelector("[data-field='BrokerName']").value;
        if(this.varUserPersona == 'Middle Office User' || this.varUserPersona == 'Middle Office Leadership'){
            //do Nothing
        }else{
            if(this.confidentialValue == true){
                FIELDS[CONFIDENTIAL_FIELD.fieldApiName] = this.template.querySelector("[data-field='Confidential']").checked;
            }else{FIELDS[CONFIDENTIAL_FIELD.fieldApiName] = false}
        }

        FIELDS[GLOBAL_PRODUCT_FIELD.fieldApiName] = this.template.querySelector("[data-field='GlobalProduct']").value;
        FIELDS[UNDERWRITING_UNIT_FIELD.fieldApiName] = this.template.querySelector("[data-field='UnderwritingUnit']").value;
        FIELDS[SEGMENT_FIELD.fieldApiName] = this.template.querySelector("[data-field='Segment']").value;
        FIELDS[REGION_FIELD.fieldApiName] = this.template.querySelector("[data-field='Region']").value;
        FIELDS[SUB_REGION_FIELD.fieldApiName] = this.template.querySelector("[data-field='Subregion']").value;
        FIELDS[PRODUCING_OFFICE_FIELD.fieldApiName] = this.template.querySelector("[data-field='ProducingOffice']").value;

        FIELDS[CURRENCY_ISO_CODE_FIELD.fieldApiName] = this.template.querySelector("[data-field='OpportunityCurrency']").value;
        FIELDS[ESTIMATED_PREMIUM_FIELD.fieldApiName] = this.template.querySelector("[data-field='EstimatedPremium']").value;

        FIELDS[PLANNING_LINE_OF_BUSINESS_FIELD.fieldApiName] = this.template.querySelector("[data-field='PlanningLineBusiness']").value;
        FIELDS[OPERATING_BUSINESS_UNIT_FIELD.fieldApiName] = this.template.querySelector("[data-field='OperatingBusinessUnit']").value;

        return FIELDS;
    }

    handleSubRegionChange(event) {
        this.subRegionValue = event.detail.value;
    }

    handleUWUnitChange(event) {
        this.undewritingUnitValue = event.detail.value;
        this.planningLineOfBusinessValue='';
        this.operatingBusinessUnitValue = '';
        this.caseOwnerValue='';
        this.plannigLineBusinessPickOptions=NONE_VALUE;
        if(this.undewritingUnitValue == '' || this.undewritingUnitValue == null){
            this.queueOptions=NONE_VALUE;
        }else{
        this.getQueueList(this.undewritingUnitValue);
        }
        const oBCcontrollerValueIndex = this.oBUControlValues[this.undewritingUnitValue];
        this.operatingBusinessUnitPickOptions = this.totalOperatingBusinessUnitData.filter(opt =>
            opt.validFor.includes(oBCcontrollerValueIndex)
        );
        this.operatingBusinessUnitPickOptions=[this.noneValueoption, ...this.operatingBusinessUnitPickOptions];
    }

    handleoperatingBusinessUnitChange(event) {
        this.operatingBusinessUnitValue = event.detail.value;
         this.planningLineOfBusinessValue='';
        const pLBControlValueIndex = this.pLBControlValues[this.operatingBusinessUnitValue];
        this.plannigLineBusinessPickOptions = this.totalPlannigLineBusinessUnitData.filter(opt =>
            opt.validFor.includes(pLBControlValueIndex)
        );
        this.plannigLineBusinessPickOptions=[this.noneValueoption, ...this.plannigLineBusinessPickOptions];
    }
    
    getQueueList(uwUnitName){
        getQueueList({unitName:uwUnitName}).then(result => {
            let unsortedQueueOptions=[];
            let sortedQueueOptions=[];
            
            if(result){
                result.forEach(queue => {
                    unsortedQueueOptions.push({label:queue.XLP_Case_Owner_Name__c, value:queue.XLP_Queue_API_Name__c});
                });
                
            }
             sortedQueueOptions= [...unsortedQueueOptions].sort((a, b) => 
                        a.label.localeCompare(b.label)
            );
            this.queueOptions=[this.noneValueoption, ...sortedQueueOptions];
            console.log('final list == '+JSON.stringify(this.queueOptions));
             console.log('Total queueOptions Value == '+this.queueOptions.length);
        }).catch(error => {
            console.log('error', error);
        });
    }

    handleCaseOwnerChange(event){
       this.caseOwnerValue = event.detail.value;
        console.log('this.caseOwnerValue == '+this.caseOwnerValue);
        if(this.caseOwnerValue != ''){
            this.getQueueIdforCaseCreation();
        }
       
    }

    getQueueIdforCaseCreation(){
        getGroupQueueId({developerAPIName:this.caseOwnerValue}).then(result => {
            if(result.length>0){
                    result.forEach(queue => {
                          this.queueIdforCaseOwner=queue.Id;
                    });
            }else{
                this.queueIdforCaseOwner='';
                let title='No Case Owner Found';
                let message='No queues or groups were found. Please contact your System Administrator for assistance';
                let variant='warning';
                let mode='dismissible';
                this.showToast(title,message , variant, mode);
            }
        }).catch(error => {
            console.log('error', error);
        });
    }

    validateAll() {
        // ... REMAINS COMPLETELY UNCHANGED ...
        let isValid = true;
        this.errorMessage = [];

        const insuredName = this.template.querySelector('[data-field="InsuredName"]');
        const prospectName = this.template.querySelector('[data-field="ProspectName"]');
        const brokerName = this.template.querySelector('[data-field="BrokerName"]');
        const newrenewal = this.template.querySelector('[data-field="NewRenewal"]');
        const globalProduct = this.template.querySelector('[data-field="GlobalProduct"]');
        const underwritingUnit = this.template.querySelector('[data-field="UnderwritingUnit"]');
        const segment = this.template.querySelector('[data-field="Segment"]');
        const region = this.template.querySelector('[data-field="Region"]');
        const subregion = this.template.querySelector('[data-field="Subregion"]');
        const producingOffice = this.template.querySelector('[data-field="ProducingOffice"]');
        const opportunityCurrency = this.template.querySelector('[data-field="OpportunityCurrency"]');
        const estimatedPremium = this.template.querySelector('[data-field="EstimatedPremium"]');
        const inceptionDate = this.template.querySelector("[data-field='InceptionDate']");
        const caseOwner = this.template.querySelector("[data-field='CaseOwner']");
        
        if ((insuredName.value == null || insuredName.value == '') && (prospectName.value == null || prospectName.value == '')) {
            this.errorMessage.push({
                field: 'Inception Date',
                message: 'If client name not found please ensure' + '\n' + 'this is captured in the Prospect Name field.'
            });
            this.reviewMessage = 'Review the errors on this page.';
            insuredName.reportValidity();
            isValid = false;
            this.showError = true;
            this.showPopup = true;
        } else if (!(insuredName.value == null || insuredName.value == '') && !(prospectName.value == null || prospectName.value == '')) {
            this.errorMessage.push({
                field: 'Inception Date',
                message: 'If client name not found please ensure' + '\n' + 'this is captured in the Prospect Name field.'
            });
            this.reviewMessage = 'Review the errors on this page.';
            insuredName.reportValidity();
            isValid = false;
            this.showError = true;
            this.showPopup = true;
        } else {
            insuredName.setCustomValidity('');
            insuredName.reportValidity();
            isValid = isValid && true;
            this.showError = false;
        }

        if (producingOffice.value == null || producingOffice.value == '') {
            this.errorMessage.push({
                field: 'Producing Office',
                message: 'Producing Office'
            });
            producingOffice.reportValidity();
            isValid = false;
            this.showError = true;
            this.showPopup = true;
        } else {
            producingOffice.setCustomValidity('');
            producingOffice.reportValidity();
            isValid = isValid && true;
        }

        if (newrenewal.value == null || newrenewal.value == '') {
            newrenewal.reportValidity();
            this.errorMessage.push({
                field: 'New/Renewal',
                message: 'New/Renewal'
            });
            isValid = false;
            this.showError = true;
            this.showPopup = true;
        } else {
            newrenewal.setCustomValidity('');
            newrenewal.reportValidity();
            isValid = isValid && true;
        }

        if (inceptionDate.value == null || inceptionDate.value == '') {
            inceptionDate.reportValidity();
            this.errorMessage.push({
                field: 'Inception Date',
                message: 'Inception Date'
            });
            isValid = false;
            this.showError = true;
            this.showPopup = true;
        } else {
            inceptionDate.setCustomValidity('');
            inceptionDate.reportValidity();
            isValid = isValid && true;
        }

        if (estimatedPremium.value == null || estimatedPremium.value == '' || this.estimatedPremiumValue <= 0) {
            this.errorMessage.push({
                field: 'Estimated Premium',
                message: 'Estimated Premium'
            });
            estimatedPremium.reportValidity();
            isValid = false;
            this.showError = true;
            this.showPopup = true;
        } else {
            estimatedPremium.setCustomValidity('');
            estimatedPremium.reportValidity();
            isValid = isValid && true;
        }

        if (opportunityCurrency.value == null || opportunityCurrency == '') {
            this.errorMessage.push({
                field: 'Opportunity Currency',
                message: 'Opportunity Currency'
            });
            opportunityCurrency.reportValidity();
            isValid = false;
            this.showError = true;
            this.showPopup = true;
        } else {
            opportunityCurrency.setCustomValidity('');
            opportunityCurrency.reportValidity();
            isValid = isValid && true;
        }

        if (subregion.value == null || subregion.value == '' || this.subRegionValue == '') {
            this.errorMessage.push({
                field: 'Sub Region',
                message: 'Sub Region'
            });
            subregion.reportValidity();
            isValid = false;
            this.showError = true;
            this.showPopup = true;
        } else {
            subregion.setCustomValidity('');
            subregion.reportValidity();
            isValid = isValid && true;
        }

        if (region.value == null || region.value == '') {
            this.errorMessage.push({
                field: 'Region',
                message: 'Region'
            });
            region.reportValidity();
            isValid = false;
            this.showError = true;
            this.showPopup = true;
        } else {
            region.setCustomValidity('');
            region.reportValidity();
            isValid = isValid && true;
        }

        if (segment.value == null || segment.value == '') {
            this.errorMessage.push({
                field: 'Segment',
                message: 'Segment'
            });
            segment.reportValidity();
            isValid = false;
            this.showError = true;
            this.showPopup = true;
        } else {
            segment.setCustomValidity('');
            segment.reportValidity();
            isValid = isValid && true;
        }

        if (underwritingUnit.value == null || underwritingUnit.value == '' || this.undewritingUnitValue == '') {
            this.errorMessage.push({
                field: 'Underwriting Unit',
                message: 'Underwriting Unit'
            });
            underwritingUnit.reportValidity();
            isValid = false;
            this.showError = true;
            this.showPopup = true;
        } else {
            underwritingUnit.setCustomValidity('');
            underwritingUnit.reportValidity();
            isValid = isValid && true;
        }

        if (globalProduct.value == null || globalProduct.value == '') {
            this.errorMessage.push({
                field: 'Global Product',
                message: 'Global Product'
            });
            globalProduct.reportValidity();
            isValid = false;
            this.showError = true;
            this.showPopup = true;
        } else {
            globalProduct.setCustomValidity('');
            globalProduct.reportValidity();
            isValid = isValid && true;
        }

        if (brokerName.value == null || brokerName.value == '') {
            this.errorMessage.push({
                field: 'Broker Name',
                message: 'Broker Name'
            });
            brokerName.reportValidity();
            isValid = false;
            this.showError = true;
            this.showPopup = true;
        } else {
            brokerName.setCustomValidity('');
            brokerName.reportValidity();
            isValid = isValid && true;
        }

        if (caseOwner.value == null || caseOwner.value == '' || this.caseOwnerValue=='') {
            this.errorMessage.push({
                field: 'Case Owner',
                message: 'Case Owner'
            });
            caseOwner.reportValidity();
            isValid = false;
            this.showError = true;
            this.showPopup = true;
        } else {
            caseOwner.setCustomValidity('');
            caseOwner.reportValidity();
            isValid = isValid && true;
        }

        return isValid;
    }

    handleEstimatedPremiumChange(event) {
        this.estimatedPremiumValue = event.target.value;
        console.log('this.estimatedPremiumValue -> ' + this.estimatedPremiumValue);
        console.log('this.estimatedPremiumValue1 -> ' + event.target.value);
    }

    handleError(event) {
        console.error('Error occured: ' + event.detail);
    }

    @track showPopup;
    @track showError = false;

    togglePopup() {
        this.showPopup = true;
    }

    hidePopover() {
        this.showPopup = false;
    }

    showPopover() {
        this.showPopup = true;
    }

    formatDate(dateString){
        const formatted = new Intl.DateTimeFormat(LOCALE, {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            timeZone: TIME_ZONE
        }).format(new Date(this.messageDetails.emailData.receivedDateTime));
        console.log('Formated Date based on locale -> '+formatted);
        return formatted;
    }

    @track varUserPersona;  
    async handlegetUserPersona(){
        await getUserPersona()
        .then((result) => {
            if (result) {
                this.varUserPersona = result;
                console.log('User persona -> '+this.varUserPersona);
            }
        }).catch((error) => {
            console.log('handleLoadRecordTypes == ' + error);
        });
    }
}
