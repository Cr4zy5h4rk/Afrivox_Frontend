import { HttpErrorResponse } from '@angular/common/http';
import { TranslationKey } from './i18n/translations';

export interface ApiError {
  key: TranslationKey;
  params?: Record<string, string | number>;
}

const SERVER_KEYS: Partial<Record<string, TranslationKey>> = {
  'error.emailexists': 'error.emailexists',
  'error.userexists': 'error.userexists',
  'error.rolerequired': 'error.rolerequired',
  'error.consentrequired': 'error.consentrequired',
  'error.invalidsize': 'error.invalidsize',
  'error.invalidduration': 'error.invalidduration',
  'error.invalidformat': 'error.invalidformat',
  'error.promptnotfound': 'error.promptnotfound',
  'error.campaigninactive': 'error.campaigninactive',
  'error.languagenotfound': 'error.languagenotfound',
  'error.toomanyrequests': 'error.toomanyrequests',
  'error.invaliddeadline': 'error.invaliddeadline',
  'error.versionexists': 'error.versionexists',
  'error.norecordings': 'error.norecordings',
  'error.datasetnotfound': 'error.datasetnotfound',
  'error.nolanguage': 'error.nolanguage',
  'error.invalidlabel': 'error.invalidlabel',
  'error.qualificationnotfound': 'error.qualificationnotfound',
  'error.recordingnotfound': 'error.recordingnotfound',
  'error.ownrecording': 'error.ownrecording',
  'error.licensenotaccepted': 'error.licensenotaccepted',
  'error.alreadypurchased': 'error.alreadypurchased',
  'error.nopricing': 'error.nopricing',
  'error.invalidurl': 'error.invalidurl',
  'error.invalidsha256': 'error.invalidsha256',
  'error.tasknotasr': 'error.tasknotasr',
  'error.languagemismatch': 'error.languagemismatch',
  'error.toosoon': 'error.toosoon',
  'error.csvinvalid': 'error.csvinvalid',
  'error.csvtoolarge': 'error.csvtoolarge',
  'error.idunknown': 'error.idunknown',
  'error.idsmissing': 'error.idsmissing',
  'error.idduplicate': 'error.idduplicate',
  'error.texttoolong': 'error.texttoolong',
  'error.testsetnotfound': 'error.testsetnotfound',
  'error.modelnotfound': 'error.modelnotfound',
  'error.invalidcomment': 'error.invalidcomment',
  'error.invalidparent': 'error.invalidparent',
  'error.invalidreason': 'error.invalidreason',
  'error.commentnotfound': 'error.commentnotfound',
  'error.ownreport': 'error.ownreport',
  'error.alreadyreported': 'error.alreadyreported',
  'error.toomanycomments': 'error.toomanycomments',
  'error.adultrequired': 'error.adultrequired',
  'error.nativelanguagerequired': 'error.nativelanguagerequired',
  'error.invalidlanguage': 'error.invalidlanguage',
  'error.triallimit': 'error.triallimit',
  'error.contributorsuspended': 'error.contributorsuspended',
};

/**
 * Transforme une erreur HTTP en clé de traduction. Le serveur renvoie `message: "error.xxx"`
 * pour ses erreurs métier ; le reste est déduit du code de statut.
 */
export function toApiError(err: unknown): ApiError {
  if (!(err instanceof HttpErrorResponse)) {
    return { key: 'error.generic' };
  }
  if (err.status === 0) {
    return { key: 'error.network' };
  }
  if (err.status === 429) {
    const seconds = Number(err.headers.get('Retry-After'));
    const minutes = Number.isFinite(seconds) && seconds > 0 ? Math.ceil(seconds / 60) : 15;
    return { key: 'error.tooManyAttempts', params: { minutes } };
  }
  if (err.status === 401) {
    return { key: 'error.badCredentials' };
  }
  const serverKey = SERVER_KEYS[err.error?.message as string];
  return { key: serverKey ?? 'error.generic' };
}
