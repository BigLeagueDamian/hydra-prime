import type { ProbeManifest } from './manifest';
import { sshConfigScan } from './probes/ssh-config-scan';
import { knownHostsEnum } from './probes/known-hosts-enum';
import { privateKeyEnum } from './probes/private-key-enum';
import { shellHistoryGrep } from './probes/shell-history-grep';
import { hostsFile } from './probes/hosts-file';
import { cloudCliEnum } from './probes/cloud-cli-enum';
import { k8sContextEnum } from './probes/k8s-context-enum';
import { vpnMeshProbe } from './probes/vpn-mesh-probe';
import { dockerComposeScan } from './probes/docker-compose-scan';
import { gitConfigScan } from './probes/git-config-scan';

export const ALL_PROBES: ProbeManifest[] = [
  sshConfigScan,
  knownHostsEnum,
  privateKeyEnum,
  shellHistoryGrep,
  hostsFile,
  cloudCliEnum,
  k8sContextEnum,
  vpnMeshProbe,
  dockerComposeScan,
  gitConfigScan,
];
