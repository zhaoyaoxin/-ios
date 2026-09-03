//
//  ruleheader.h
//
//
//  Created by ZL on 21/09/2025.
//  Copyright © 2025 ZL. All rights reserved.
//

#pragma once

#define PROTO_ANY     65535
#define DOMANAME_SIZE                64
#define DOMANAME_BUFF_SIZE           256
#define PROCNAME_SIZE_MAX              24   // strlen(MAX_PROCNAME) == 16 yet
#define MATCHRULE_SIZE_MAX             64
#define AREA_ANY_RULE   65535
#define ISP_ANY_RULE    65535
#define AREA_ISP_RULE_END_ID     55555  // 用作数组结束标记
#define AREA_NONE_RULE  0
#define ISP_NONE_RULE   0

#define DNS_PORT        53
#define HEADER_LEN_UDP      8
#define HEADER_LEN_VXLAN    8
#define HEADER_LEN_ETHERNET 14
#define HEADER_LEN_DNS       12
