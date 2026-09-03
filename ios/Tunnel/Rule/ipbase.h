//
//  ipbase.h
//
//
//  Created by ZL on 31/09/2025.
//  Copyright © 2025 ZL. All rights reserved.
//

#pragma once

#include "iprange_list.h"

#ifdef __cplusplus
extern "C" {
#endif
    
struct ip_range_info_list *ipbase_new_from_file(const char *path, bool n2ping_true_K1_false);
    
#ifdef __cplusplus
}
#endif

