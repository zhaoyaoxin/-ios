//
//  ip_range_info_list.c
//  Gnwj
//
//  Created by ZL on 15/09/2025.
//  Copyright © 2025 gnwj. All rights reserved.
//

#include "iprange_list.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <arpa/inet.h>

/**

 @param base little order addr
 @param mask 0 ~ 32
 @param range ip_range_info
 @return bool
 */
bool ip_range_cal(uint32_t base, uint32_t mask, struct ip_range_info *range)
{
    if ( mask > 32 ) {
        return false;
    }
    
    if ( mask == 32 ) {
        range->start = base;
        range->end = base;
        return true;
    }
    
    if ( mask == 0 ) {
        range->start = 0;
        range->end = 0xffffffff;
        return true;
    }
    
    int m = 32 - mask;
    int start = (base >> m) << m;
    int end = start | ~((0xffffffff >> m) << m);
    
    range->start = start;
    range->end = end;
    
    return true;
}

struct ip_range_info ip_range_with_cidr(const char *cidr)
{
    char buff[255], *host, *mask;
    int m = 32;
    
    struct ip_range_info range = {
        .start = 0,
        .end = 0
    };
    
    if ( 0 == strlen(strcpy(buff, cidr)) ) {
        return range;
    }
    
    char *delim = "/";
    char *needle = strstr(buff, delim);
    
    if ( needle ) {
        mask = needle + strlen(delim);
        m = atoi(mask);
        needle[0] = 0x00;
    }
    
    host = buff;
    int base = ntohl(inet_addr(host));

    if ( !ip_range_cal(base, m, &range) ) {
        printf("Error cal range: base: %s, mask: %d \n", host, m);
    }

    return range;
}

///////////////////////////////////////////////////////////////////////////////////////////////////

struct ip_range_info_list *ip_range_list_init(const uint32_t nmemb)
{
    struct ip_range_info_list *list = (struct ip_range_info_list *) malloc(sizeof(struct ip_range_info_list));
    
    if ( list ) {
        struct ip_range_info *base = (struct ip_range_info *) malloc(sizeof(struct ip_range_info) * nmemb);
        
        if (!base) {
            free(list);
            return NULL;
        }
        
        list->base = base;
        list->nmemb = nmemb;
        
        clear_ip_range_info(list);
        
        return list;
    }
    
    return NULL;
}

void set_ip_range_info(struct ip_range_info_list *ipdb, uint32_t index, uint32_t start, uint32_t end, uint32_t value)
{
    if ( index > ipdb->nmemb ) {
        return;
    }
    
    (ipdb->base)[index].start = start;
    (ipdb->base)[index].end = end;
}

void clear_ip_range_info(struct ip_range_info_list *ipdb)
{
    memset(ipdb->base, 0, sizeof(struct ip_range_info) * ipdb->nmemb);
}

static int compare_ip_range(const void *a, const void *b)
{
    struct ip_range_info *lhs = (struct ip_range_info *) a;
    struct ip_range_info *rhs = (struct ip_range_info *) b;
    
    if (lhs->start < rhs->start)
        return -1;
    else if (lhs->start > rhs->end)
        return 1;
    else
        return 0;
}

void sort_ip_range_info(struct ip_range_info_list *ipdb)
{
    qsort(ipdb->base, ipdb->nmemb, sizeof(struct ip_range_info), compare_ip_range);
}

struct ip_range_info *find_range_from_range_list(const struct ip_range_info_list *ipdb, uint32_t addr_net)
{
    if (!ipdb)
        return NULL;
    
    uint32_t addr = ntohl(addr_net);
    
    struct ip_range_info tmp = {
        .start = addr,
        .end = addr
    };
    
    struct ip_range_info *target = bsearch(&tmp, ipdb->base, ipdb->nmemb, sizeof(struct ip_range_info), compare_ip_range);
    return target;
}

uint32_t find_value_from_range_list(const struct ip_range_info_list *ipdb, uint32_t addr_net)
{
    struct ip_range_info *target = find_range_from_range_list(ipdb, addr_net);
    if ( target != NULL ) {
        return target->value;
    }
    return 0;
}

bool ip_in_range_list(const struct ip_range_info_list *ipdb, uint32_t addr_net)
{
    return find_range_from_range_list(ipdb, addr_net) != NULL;
}

bool ipstr_in_range_list(const struct ip_range_info_list *ipdb, const char *ipstr)
{
    return ip_in_range_list(ipdb, inet_addr(ipstr));
}

void free_ip_range_list(struct ip_range_info_list *ipdb)
{
    if (ipdb) {
        if (ipdb->base) free(ipdb->base);
        free(ipdb);
        ipdb = NULL;
    }
}


