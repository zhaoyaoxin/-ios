//
//  ip_range_info_list.h
//  Gnwj
//
//  Created by ZL on 15/09/2025.
//  Copyright © 2025 gnwj. All rights reserved.
//

#pragma once

#include <stdint.h>
#include <stdbool.h>

#ifdef __cplusplus
extern "C" {
#endif

struct ip_range_info {
    uint32_t start;
    uint32_t end;
    uint32_t value;
};

struct ip_range_info ip_range_with_cidr(const char *cidr);

///////////////////////////////////////////////////////////////////////////////////////////////////

struct ip_range_info_list {
    struct ip_range_info *base;
    uint32_t nmemb;
};

struct ip_range_info_list *ip_range_list_init(const uint32_t nmemb);
void set_ip_range_info(struct ip_range_info_list *ipdb, uint32_t index, uint32_t start, uint32_t end, uint32_t value);
void clear_ip_range_info(struct ip_range_info_list *ipdb);
void sort_ip_range_info(struct ip_range_info_list *ipdb);
struct ip_range_info *find_range_from_range_list(const struct ip_range_info_list *ipdb, uint32_t addr_net);
uint32_t find_value_from_range_list(const struct ip_range_info_list *ipdb, uint32_t addr_net);
bool ip_in_range_list(const struct ip_range_info_list *ipdb, uint32_t addr_net);
bool ipstr_in_range_list(const struct ip_range_info_list *ipdb, const char *ipstr);
void free_ip_range_list(struct ip_range_info_list *ipdb);

#ifdef __cplusplus
}
#endif
