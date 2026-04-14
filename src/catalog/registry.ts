import type { ProbeManifest } from './manifest';
import { sshConfigScan } from './probes/ssh-config-scan';
import { knownHostsEnum } from './probes/known-hosts-enum';
import { privateKeyEnum } from './probes/private-key-enum';
import { shellHistoryGrep } from './probes/shell-history-grep';
import { hostsFile } from './probes/hosts-file';

export const ALL_PROBES: ProbeManifest[] = [
  sshConfigScan,
  knownHostsEnum,
  privateKeyEnum,
  shellHistoryGrep,
  hostsFile,
];
