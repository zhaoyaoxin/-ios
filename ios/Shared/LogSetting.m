//
//  LogSetting.m
//  Gnwj
//
//  Created by Z0 on 15/09/2025.
//  Copyright © 2025 gnwj. All rights reserved.
//

#import <Foundation/Foundation.h>
#import <execinfo.h>
#import "LogSetting.h"

#pragma mark - Call Stack
/*
static NSUncaughtExceptionHandler *__previousExceptionHandler;

void STHandleException(NSException* exception)
{
    
    LOG_Error(@"Uncaught Exception, description:%@, call stack:%@",
             exception.description,
             [exception callStackSymbols]);
    if (__previousExceptionHandler) {
        __previousExceptionHandler(exception);
    }
    
}

void LOG_LoggerInstallUncaughtExceptionHandler(void)
{
    
    __previousExceptionHandler = NSGetUncaughtExceptionHandler();
    NSSetUncaughtExceptionHandler(&STHandleException);
    
}

void LOG_LoggerPrintCallStack(void)
{

    void *callstack[128];
    int frames = backtrace(callstack, 128);
    char **strs = backtrace_symbols(callstack, frames);
    
    NSMutableArray *backtrace = [NSMutableArray arrayWithCapacity:frames];
    for (int  i = 0; i < frames; i++)
    {
        [backtrace addObject:@(strs[i])];
    }
    free(strs);
    
    LOG_Info(@"Call stack:%@", backtrace);
}
*/
